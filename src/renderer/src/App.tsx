import { useTranslation } from 'react-i18next'
import { initialSettings, t } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { EditorPane } from '@/components/EditorPane'
import { FileTree } from '@/components/FileTree'
import {
  CREATE_DEFAULT_NAMES,
  getAvailableName,
  type EditingState
} from '@/components/file-tree-editing'
import { OutlinePanel } from '@/components/OutlinePanel'
import { StatusBar } from '@/components/StatusBar'
import { Titlebar } from '@/components/Titlebar'
import { UpdateDialog } from '@/components/UpdateDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useAppUpdater } from '@/hooks/useAppUpdater'
import { parseOutline } from '@/lib/outline'
import { cn } from '@/lib/utils'
import { SettingsPage } from '@/pages/settings'
import { useEditorStore } from '@/store/editor-store'

type AppSurface = 'editor' | 'settings'

// 固定页签配置集中定义侧栏视图与显示文案。
const SIDEBAR_TABS = [
  { value: 'files', label: 'workspace.files' },
  { value: 'outline', label: 'workspace.outline' }
] as const

/** Coordinates the application shell, editor workspace, and settings surface. */
function App(): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Shell-local navigation preserves editor state without expanding the shared store.
  const [activeSurface, setActiveSurface] = useState<AppSurface>('editor')
  // 顶部、欢迎页入口与文件树共用唯一的树内命名状态。
  const [treeEditing, setTreeEditing] = useState<EditingState | null>(null)
  // 统一承接顶栏快捷键与标签页关闭触发的未保存确认状态。
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null)
  // 保存并关闭操作进行时防止重复点击。
  const [isClosingSave, setIsClosingSave] = useState(false)
  // 侧栏分段按钮引用用于支持左右方向键切换焦点。
  const sidebarTabRefs = useRef<Partial<Record<(typeof SIDEBAR_TABS)[number]['value'], HTMLButtonElement | null>>>({})
  // Theme state controls renderer styling and native window persistence.
  const theme = useEditorStore((state) => state.theme)
  // Panel visibility remains shared editor state.
  const sidebarOpen = useEditorStore((state) => state.sidebarOpen)
  // 当前侧栏页签决定显示文件树或文档大纲。
  const sidebarView = useEditorStore((state) => state.sidebarView)
  // 页签操作同时打开侧栏并持久化当前选择。
  const setSidebarView = useEditorStore((state) => state.setSidebarView)
  // Active document key selects document-specific shell data.
  const activeKey = useEditorStore((state) => state.activeKey)
  // Open documents supply pending close confirmation copy.
  const openDocs = useEditorStore((state) => state.openDocs)
  // Active Markdown drives outline parsing and autosave.
  const activeRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.rawMarkdown ?? null) : null
  )
  // Saved Markdown establishes the dirty comparison baseline.
  const activeSavedRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.savedRawMarkdown ?? null) : null
  )
  // Disk path determines whether autosave can write directly.
  const activeDiskPath = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.diskPath ?? null) : null
  )
  // 磁盘缺失状态暂停当前文档的自动保存。
  const activeFileMissing = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.isMissingOnDisk ?? false) : false
  )
  // Settings visibility selects the active shell surface.
  const isSettingsOpen = activeSurface === 'settings'
  // Updater state coordinates notifications, titlebar access, and the detail dialog.
  const updater = useAppUpdater()

  /** Opens the dedicated settings workspace. */
  const openSettings = useCallback((): void => setActiveSurface('settings'), [])

  /** Restores the mounted editor workspace. */
  const returnToEditor = useCallback((): void => setActiveSurface('editor'), [])

  /** 统一校验脏状态并安全关闭指定标签页，避免快捷键绕过防丢稿确认。 */
  const requestCloseTab = useCallback((key: string): void => {
    const store = useEditorStore.getState()
    const doc = store.openDocs[key]
    if (!doc) return
    if (doc.rawMarkdown !== doc.savedRawMarkdown) {
      setPendingCloseKey(key)
      return
    }
    store.closeTab(key)
  }, [])

  /** 按当前工作区启动新建流程，保持传给记忆化编辑区的回调引用稳定。 */
  const handleNewFile = useCallback((): void => {
    setActiveSurface('editor')
    // 点击时的最新目录上下文决定新建位置。
    const store = useEditorStore.getState()
    if (!store.workspaceRoot) {
      store.newUntitled()
      return
    }
    store.setSidebarView('files')
    setTreeEditing({
      kind: 'create-file',
      parent: store.workspaceRoot,
      value: getAvailableName(
        t(CREATE_DEFAULT_NAMES['create-file']),
        store.treeNodes[store.workspaceRoot] ?? []
      ),
      depth: 0,
      openAfterCreate: true,
      shouldFocus: true
    })
  }, [])

  /** 保存待关闭文档，仅在写入成功后关闭对应标签页。 */
  const handleSaveAndClosePendingTab = async (): Promise<void> => {
    if (!pendingCloseKey || isClosingSave) return
    const store = useEditorStore.getState()
    const doc = store.openDocs[pendingCloseKey]
    if (!doc) {
      setPendingCloseKey(null)
      return
    }
    setIsClosingSave(true)
    try {
      let saved = false
      if (!doc.diskPath || doc.isMissingOnDisk) {
        if (store.activeKey !== pendingCloseKey) store.activateTab(pendingCloseKey)
        saved = await useEditorStore.getState().saveActiveAs()
      } else {
        saved = await store.saveDocument(pendingCloseKey, true)
      }
      if (saved) {
        useEditorStore.getState().closeTab(pendingCloseKey)
        setPendingCloseKey(null)
      }
    } finally {
      setIsClosingSave(false)
    }
  }

  /** 支持侧栏文件与大纲页签的左右方向键切换。 */
  const handleSidebarTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + SIDEBAR_TABS.length) % SIDEBAR_TABS.length
    const nextTab = SIDEBAR_TABS[nextIndex]
    setSidebarView(nextTab.value)
    sidebarTabRefs.current[nextTab.value]?.focus()
  }

  useEffect(() => {
    return useEditorStore.subscribe((state, previous) => {
      if (state.workspaceRoot !== previous.workspaceRoot) setTreeEditing(null)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    void window.api.settings.set({ theme })
  }, [theme])

  useEffect(() => {
    if (!isSettingsOpen) return
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // 存在开启的弹窗或下拉框时保留给浮层自行关闭。
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"]')) return
      event.preventDefault()
      returnToEditor()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isSettingsOpen, returnToEditor])

  useEffect(() => {
    // Mounted guard prevents settings from applying after effect cleanup.
    let mounted = true
    /** 恢复设置与历史工作区，再允许消费系统文件请求。 */
    const initializeWorkspace = async (): Promise<void> => {
      // 设置快照决定本次启动需要恢复的历史根目录。
      const settings = await initialSettings
      if (!mounted) return
      useEditorStore.getState().setTheme(settings.theme)
      useEditorStore.getState().setRecent(settings.recent)
      if (settings.recent.lastWorkspace) {
        await useEditorStore
          .getState()
          .openWorkspacePath(settings.recent.lastWorkspace)
          .catch(() => undefined)
      }
    }

    /** 顺序打开主进程当前队列中的文件。 */
    const openPendingFiles = async (): Promise<void> => {
      if (!mounted) return
      // 待打开路径通过一次原子读取从主进程队列中移除。
      const paths = await window.api.app.takeOpenFilePaths()
      if (paths.length === 0) return
      setActiveSurface('editor')
      // 同一批次逐个等待目录协调完成，最后一个文件保持活动状态。
      const store = useEditorStore.getState()
      for (const path of paths) await store.openPath(path)
    }

    // Promise 链同时保证初始化先完成、不同请求批次不重叠。
    let openQueue = initializeWorkspace()
    /** 将系统请求接入同一消费队列，前一次失败不阻止后续请求。 */
    const enqueueOpenFiles = (): void => {
      openQueue = openQueue.then(openPendingFiles, openPendingFiles)
    }
    // 先订阅再安排首次消费，期间到达的路径仍保留在主进程队列中。
    const unsubscribe = window.api.app.onOpenFilesRequested(enqueueOpenFiles)
    enqueueOpenFiles()
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return window.api.workspace.onChanged((directory) => {
      void useEditorStore.getState().handleWorkspaceChange(directory)
    })
  }, [])

  useEffect(() => {
    return window.api.settings.onRecentChanged((recent) => {
      useEditorStore.getState().setRecent(recent)
    })
  }, [])

  useEffect(() => {
    return window.api.menu.onAction((action) => {
      // Current store snapshot routes native menu commands.
      const store = useEditorStore.getState()
      switch (action) {
        case 'new-file':
          handleNewFile()
          break
        case 'open-file':
          setActiveSurface('editor')
          void store.openFileDialog()
          break
        case 'open-workspace':
          setActiveSurface('editor')
          void store.openWorkspace()
          break
        case 'save':
          void store.saveActive()
          break
        case 'save-as':
          void store.saveActiveAs()
          break
        case 'close-tab':
          if (store.activeKey) requestCloseTab(store.activeKey)
          break
        case 'toggle-sidebar':
          store.toggleSidebar()
          break
        case 'toggle-outline':
          store.toggleOutline()
          break
        case 'toggle-source':
          store.toggleMode()
          break
        case 'toggle-theme':
          store.toggleTheme()
          break
        case 'open-settings':
          setActiveSurface((surface) => (surface === 'settings' ? 'editor' : 'settings'))
          break
      }
    })
  }, [handleNewFile, requestCloseTab])

  useEffect(() => window.api.app.setDirtyCount(updater.dirtyCount), [updater.dirtyCount])

  useEffect(() => {
    if (
      !activeKey ||
      !activeDiskPath ||
      activeFileMissing ||
      activeRawMarkdown === null ||
      activeRawMarkdown === activeSavedRawMarkdown
    ) {
      return
    }
    // Debounce timer batches active document autosaves.
    const timer = window.setTimeout(() => {
      void useEditorStore.getState().saveDocument(activeKey)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [
    activeKey,
    activeDiskPath,
    activeFileMissing,
    activeRawMarkdown,
    activeSavedRawMarkdown
  ])

  // Parsed headings feed the outline panel for the active document.
  const outlineItems = useMemo(() => parseOutline(activeRawMarkdown ?? ''), [activeRawMarkdown])
  // Pending close document supplies confirmation dialog copy.
  const pendingCloseDoc = pendingCloseKey ? openDocs[pendingCloseKey] : null

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        isSettingsOpen={isSettingsOpen}
        updateState={updater.updateState}
        downloadProgress={updater.downloadProgress}
        onOpenSettings={openSettings}
        onReturnToEditor={returnToEditor}
        onNewFile={handleNewFile}
        onOpenUpdate={updater.openDialog}
      />
      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1',
            isSettingsOpen && 'pointer-events-none invisible'
          )}
        >
          <Group orientation="horizontal" id="inkdown.panels" className="flex min-w-0 flex-1">
            {sidebarOpen && (
              <>
                <Panel defaultSize={256} minSize={210} maxSize={380} className="bg-panel">
                  <div className="flex h-full flex-col">
                    <div className="flex h-9 shrink-0 items-center border-b px-2">
                      <div
                        role="tablist"
                        aria-label={t('workspace.sidebar-navigation')}
                        className="grid w-full grid-cols-2 rounded-md bg-muted/80 p-0.5"
                      >
                        {SIDEBAR_TABS.map((tab, index) => {
                          // 当前页签状态控制分段胶囊选中样式和无障碍属性。
                          const isSelected = sidebarView === tab.value
                          return (
                            <button
                              key={tab.value}
                              ref={(element) => {
                                sidebarTabRefs.current[tab.value] = element
                              }}
                              id={`sidebar-tab-${tab.value}`}
                              type="button"
                              role="tab"
                              tabIndex={isSelected ? 0 : -1}
                              aria-selected={isSelected}
                              aria-controls={`sidebar-panel-${tab.value}`}
                              className={cn(
                                'flex h-6.5 items-center justify-center rounded-[4px] px-2 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
                                isSelected && 'bg-background text-foreground shadow-xs'
                              )}
                              onClick={() => setSidebarView(tab.value)}
                              onKeyDown={(event) => handleSidebarTabKeyDown(event, index)}
                            >
                              {t(tab.label)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div
                      id={`sidebar-panel-${sidebarView}`}
                      role="tabpanel"
                      aria-labelledby={`sidebar-tab-${sidebarView}`}
                      className="min-h-0 flex-1"
                    >
                      {sidebarView === 'files' ? (
                        <FileTree editing={treeEditing} onEdit={setTreeEditing} />
                      ) : (
                        <OutlinePanel documentKey={activeKey} items={outlineItems} />
                      )}
                    </div>
                  </div>
                </Panel>
                <Separator className="group relative z-10 -mx-1 flex w-2 items-center justify-center bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                  <span
                    aria-hidden="true"
                    className="h-full w-px bg-border transition-colors group-hover:bg-ring/60 group-focus-visible:bg-ring"
                  />
                </Separator>
              </>
            )}
            <Panel minSize={360} className="min-w-0">
              <EditorPane onNewFile={handleNewFile} onRequestCloseTab={requestCloseTab} />
            </Panel>
          </Group>
        </div>
        {isSettingsOpen && (
          <div className="absolute inset-0 flex">
            <SettingsPage
              onClose={returnToEditor}
              updateState={updater.updateState}
              currentVersion={updater.currentVersion}
              checkState={updater.checkState}
              onCheckForUpdates={() => void updater.checkForUpdates()}
              onOpenUpdate={updater.openDialog}
            />
          </div>
        )}
      </div>
      {!isSettingsOpen && activeKey && <StatusBar />}
      <AlertDialog
        open={Boolean(pendingCloseDoc)}
        onOpenChange={(open) => {
          if (!open && !isClosingSave) setPendingCloseKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspace.close-unsaved-document')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workspace.close-unsaved-description', {
                name: pendingCloseDoc?.name ?? t('workspace.current-document')
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" disabled={isClosingSave}>
              {t('workspace.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isClosingSave}
              onClick={() => {
                if (pendingCloseKey) useEditorStore.getState().closeTab(pendingCloseKey)
                setPendingCloseKey(null)
              }}
            >
              {t('workspace.discard-and-close')}
            </AlertDialogAction>
            <Button
              type="button"
              disabled={isClosingSave}
              onClick={() => void handleSaveAndClosePendingTab()}
            >
              {isClosingSave ? t('workspace.saving-2') : t('workspace.save-and-close')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UpdateDialog
        updateState={updater.updateState}
        dirtyCount={updater.dirtyCount}
        isOpen={updater.isDialogOpen}
        isWorking={updater.isWorking}
        onOpenChange={updater.setDialogOpen}
        onPrimaryAction={() => void updater.runPrimaryAction()}
      />
      <Toaster theme={theme} position="bottom-right" closeButton />
    </div>
  )
}

export default App
