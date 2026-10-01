import { useTranslation } from 'react-i18next'
import { initialSettings, t } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { EditorPane } from '@/components/EditorPane'
import { FileTree } from '@/components/FileTree'
import {
  CREATE_DEFAULT_NAMES,
  getAvailableName,
  type EditingState
} from '@/components/file-tree-editing'
import { OutlinePanel } from '@/components/OutlinePanel'
import { SettingsPage } from '@/pages/settings'
import { StatusBar } from '@/components/StatusBar'
import { Titlebar } from '@/components/Titlebar'
import { UpdateDialog } from '@/components/UpdateDialog'
import { Toaster } from '@/components/ui/sonner'
import { useAppUpdater } from '@/hooks/useAppUpdater'
import { cn } from '@/lib/utils'
import { parseOutline } from '@/lib/outline'
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
  const openSettings = (): void => setActiveSurface('settings')

  /** Restores the mounted editor workspace. */
  const returnToEditor = (): void => setActiveSurface('editor')

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
    // Mounted guard prevents applying settings after effect cleanup.
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
          setActiveSurface('editor')
          store.newUntitled()
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
          if (store.activeKey) store.closeTab(store.activeKey)
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
      }
    })
  }, [])

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
                <Panel defaultSize={260} minSize={220} maxSize={380} className="bg-panel">
                  <div className="flex h-full flex-col">
                    <div
                      role="tablist"
                      aria-label={t('workspace.sidebar-navigation')}
                      className="flex h-9 shrink-0 items-center border-b px-2"
                    >
                      {SIDEBAR_TABS.map((tab) => {
                        // 当前页签状态控制选中样式和无障碍属性。
                        const isSelected = sidebarView === tab.value
                        return (
                          <button
                            key={tab.value}
                            id={`sidebar-tab-${tab.value}`}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            aria-controls={`sidebar-panel-${tab.value}`}
                            className={cn(
                              'relative flex h-full flex-1 items-center justify-center px-2 text-xs font-medium text-muted-foreground outline-none transition-colors after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-8 after:-translate-x-1/2 after:bg-transparent hover:bg-accent/60 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                              isSelected && 'font-semibold text-primary after:bg-primary'
                            )}
                            onClick={() => setSidebarView(tab.value)}
                          >
                            {t(tab.label)}
                          </button>
                        )
                      })}
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
                <Separator className="w-px bg-border transition-colors hover:bg-primary/60" />
              </>
            )}
            <Panel minSize={360} className="min-w-0">
              <EditorPane onNewFile={handleNewFile} />
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
      {!isSettingsOpen && <StatusBar />}
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
