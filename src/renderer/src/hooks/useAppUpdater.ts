import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  AppUpdateCheckResult,
  AppUpdateDownloadProgress,
  AppUpdateState
} from '../../../shared/contracts'
import { useEditorStore } from '@/store/editor-store'

export interface UpdateCheckViewState {
  status: AppUpdateCheckResult['status'] | 'idle' | 'checking' | 'error'
  version: string | null
}

interface UseAppUpdaterResult {
  updateState: AppUpdateState | null
  downloadProgress: AppUpdateDownloadProgress | null
  currentVersion: string | null
  checkState: UpdateCheckViewState
  dirtyCount: number
  isDialogOpen: boolean
  isWorking: boolean
  checkForUpdates: () => Promise<void>
  openDialog: () => void
  setDialogOpen: (open: boolean) => void
  runPrimaryAction: () => Promise<void>
}

// Update notification copy follows the action supplied by the main process.
const UPDATE_NOTIFICATION_COPY: Record<AppUpdateState['action'], string> = {
  download: 'Inkdown 新版本可供下载',
  install: 'Inkdown 更新已准备就绪'
}

/** Saves every dirty document in tab order and restores the original active tab. */
async function saveDirtyDocuments(): Promise<boolean> {
  // Initial store state identifies the save order and tab to restore.
  const initialState = useEditorStore.getState()
  // Dirty keys are captured before the modal save flow begins.
  const dirtyKeys = initialState.tabOrder.filter((key) => {
    // Current document determines whether this tab needs saving.
    const document = initialState.openDocs[key]
    return document && document.rawMarkdown !== document.savedRawMarkdown
  })
  // Original active key prevents Save As prompts from changing the user's context.
  const originalActiveKey = initialState.activeKey

  try {
    for (const key of dirtyKeys) {
      // Latest document state avoids saving work already handled by autosave.
      const store = useEditorStore.getState()
      // Current document may have closed or finished saving during the flow.
      const document = store.openDocs[key]
      if (!document || document.rawMarkdown === document.savedRawMarkdown) continue
      if (!document.diskPath || document.isMissingOnDisk) store.activateTab(key)
      // Existing save behavior handles both direct writes and Save As prompts.
      const saved = await useEditorStore.getState().saveDocument(key, true)
      if (!saved) return false
    }
    return true
  } finally {
    // Existing original tab is restored after success, cancellation, or failure.
    const currentStore = useEditorStore.getState()
    if (originalActiveKey && currentStore.openDocs[originalActiveKey]) {
      currentStore.activateTab(originalActiveKey)
    }
  }
}

/** Coordinates update state, notifications, document saving, and update actions. */
export function useAppUpdater(): UseAppUpdaterResult {
  // Actionable update state drives the titlebar entry and detail dialog.
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null)
  // Download progress drives the temporary non-interactive titlebar indicator.
  const [downloadProgress, setDownloadProgress] = useState<AppUpdateDownloadProgress | null>(null)
  // Dialog visibility remains local to the application shell.
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Working state prevents duplicate download or restart requests.
  const [isWorking, setIsWorking] = useState(false)
  // Current version comes from the packaged Electron application metadata.
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  // Manual check state supplies inline feedback on the settings page.
  const [checkState, setCheckState] = useState<UpdateCheckViewState>({
    status: 'idle',
    version: null
  })
  // Dirty count controls the install explanation and save flow.
  const dirtyCount = useEditorStore(
    (state) =>
      Object.values(state.openDocs).filter(
        (document) => document.rawMarkdown !== document.savedRawMarkdown
      ).length
  )

  /** Opens update details from the toast or titlebar entry. */
  const openDialog = (): void => setIsDialogOpen(true)

  /** Closes update details only while no update action is running. */
  const setDialogOpen = (open: boolean): void => {
    if (!isWorking) setIsDialogOpen(open)
  }

  /** Checks for updates once and stores a user-facing result for this session. */
  const checkForUpdates = async (): Promise<void> => {
    if (checkState.status === 'checking') return
    setCheckState({ status: 'checking', version: null })
    try {
      // Main process performs provider access and platform availability checks.
      const result = await window.api.updater.check()
      setCheckState(result)
    } catch {
      setCheckState({ status: 'error', version: null })
    }
  }

  /** Opens the trusted macOS release page for manual installation. */
  async function handleDownload(): Promise<void> {
    // Main process owns the fixed external URL opened by this action.
    const opened = await window.api.updater.openDownload()
    if (!opened) throw new Error('更新下载地址当前不可用')
    setIsDialogOpen(false)
  }

  /** Saves dirty documents before installing a downloaded update. */
  async function handleInstall(): Promise<void> {
    // Installation starts only after every dirty document is saved.
    const saved = await saveDirtyDocuments()
    if (!saved) {
      toast.error('未能保存全部文档', { description: '更新尚未启动，请保存后重试。' })
      return
    }
    // Main process validates that a downloaded update is still available.
    const installing = await window.api.updater.install()
    if (!installing) throw new Error('已下载的更新当前不可用')
  }

  /** Runs the platform-specific update action selected in the detail dialog. */
  const runPrimaryAction = async (): Promise<void> => {
    if (!updateState || isWorking) return
    // Action handlers dispatch the fixed behavior for the current update state.
    const actionHandlers: Record<AppUpdateState['action'], () => Promise<void>> = {
      download: handleDownload,
      install: handleInstall
    }
    setIsWorking(true)
    try {
      await actionHandlers[updateState.action]()
    } catch (error) {
      toast.error('无法继续更新', { description: String(error) })
    } finally {
      setIsWorking(false)
    }
  }

  useEffect(() => {
    // Mounted guard prevents late IPC responses from updating an unmounted shell.
    let mounted = true
    /** Applies an actionable update received from the main process. */
    const applyUpdateState = (state: AppUpdateState): void => {
      if (mounted) setUpdateState(state)
    }
    // Subscription captures future updates while the query recovers earlier events.
    const unsubscribe = window.api.updater.onStateChanged(applyUpdateState)
    // Progress subscription captures automatic downloads while the query recovers earlier events.
    const unsubscribeDownloadProgress =
      window.api.updater.onDownloadProgressChanged(setDownloadProgress)
    void window.api.updater.getState().then((state) => {
      if (mounted && state) setUpdateState(state)
    })
    void window.api.updater.getDownloadProgress().then((progress) => {
      if (mounted) setDownloadProgress(progress)
    })
    void window.api.app.getVersion().then((version) => {
      if (mounted) setCurrentVersion(version)
    })
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeDownloadProgress()
    }
  }, [])

  useEffect(() => {
    if (!updateState) return
    // Stable toast ID prevents duplicate prompts for the same session update.
    const toastId = `app-update-${updateState.action}-${updateState.version}`
    toast.info(UPDATE_NOTIFICATION_COPY[updateState.action], {
      id: toastId,
      description: `版本 ${updateState.version}`,
      action: { label: '查看', onClick: () => setIsDialogOpen(true) },
      duration: 8000
    })
  }, [updateState])

  return {
    updateState,
    downloadProgress,
    currentVersion,
    checkState,
    dirtyCount,
    isDialogOpen,
    isWorking,
    checkForUpdates,
    openDialog,
    setDialogOpen,
    runPrimaryAction
  }
}
