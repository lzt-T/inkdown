import { useEffect, useMemo, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Toaster as SonnerToaster } from 'sonner'
import { EditorPane } from '@/components/EditorPane'
import { FileTree } from '@/components/FileTree'
import { OutlinePanel } from '@/components/OutlinePanel'
import { SettingsPage } from '@/components/SettingsPage'
import { StatusBar } from '@/components/StatusBar'
import { Titlebar } from '@/components/Titlebar'
import { cn } from '@/lib/utils'
import { parseOutline } from '@/lib/outline'
import { useEditorStore } from '@/store/editor-store'

type AppSurface = 'editor' | 'settings'

/** Coordinates the application shell, editor workspace, and settings surface. */
function App(): React.JSX.Element {
  // Shell-local navigation preserves editor state without expanding the shared store.
  const [activeSurface, setActiveSurface] = useState<AppSurface>('editor')
  // Theme state controls renderer styling and native window persistence.
  const theme = useEditorStore((state) => state.theme)
  // Panel visibility remains shared editor state.
  const sidebarOpen = useEditorStore((state) => state.sidebarOpen)
  // Outline visibility remains shared editor state.
  const outlineOpen = useEditorStore((state) => state.outlineOpen)
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
  // Dirty document count is forwarded to the native application shell.
  const dirtyCount = useEditorStore(
    (state) =>
      Object.values(state.openDocs).filter((doc) => doc.rawMarkdown !== doc.savedRawMarkdown).length
  )
  // Settings visibility selects the active shell surface.
  const isSettingsOpen = activeSurface === 'settings'

  /** Opens the dedicated settings workspace. */
  const openSettings = (): void => setActiveSurface('settings')

  /** Restores the mounted editor workspace. */
  const returnToEditor = (): void => setActiveSurface('editor')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    void window.api.settings.set({ theme })
  }, [theme])

  useEffect(() => {
    // Mounted guard prevents applying settings after effect cleanup.
    let mounted = true
    void window.api.settings.get().then((settings) => {
      if (!mounted) return
      useEditorStore.getState().setTheme(settings.theme)
      useEditorStore.getState().setRecent(settings.recent)
      if (settings.recent.lastWorkspace) {
        void useEditorStore
          .getState()
          .openWorkspacePath(settings.recent.lastWorkspace)
          .catch(() => undefined)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return window.api.workspace.onChanged((directory) => {
      void useEditorStore.getState().handleWorkspaceChange(directory)
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

  useEffect(() => window.api.app.setDirtyCount(dirtyCount), [dirtyCount])

  useEffect(() => {
    if (
      !activeKey ||
      !activeDiskPath ||
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
  }, [activeKey, activeDiskPath, activeRawMarkdown, activeSavedRawMarkdown])

  // Parsed headings feed the outline panel for the active document.
  const outlineItems = useMemo(() => parseOutline(activeRawMarkdown ?? ''), [activeRawMarkdown])

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        isSettingsOpen={isSettingsOpen}
        onOpenSettings={openSettings}
        onReturnToEditor={returnToEditor}
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
                <Panel defaultSize={240} minSize={200} maxSize={360} className="bg-panel">
                  <FileTree />
                </Panel>
                <Separator className="w-px bg-border transition-colors hover:bg-primary/60" />
              </>
            )}
            <Panel minSize={360} className="min-w-0">
              <EditorPane />
            </Panel>
            {outlineOpen && (
              <>
                <Separator className="w-px bg-border transition-colors hover:bg-primary/60" />
                <Panel defaultSize={260} minSize={220} maxSize={380} className="bg-panel">
                  <OutlinePanel items={outlineItems} />
                </Panel>
              </>
            )}
          </Group>
        </div>
        {isSettingsOpen && (
          <div className="absolute inset-0 flex">
            <SettingsPage onClose={returnToEditor} />
          </div>
        )}
      </div>
      {!isSettingsOpen && <StatusBar />}
      <SonnerToaster theme={theme} position="bottom-right" richColors closeButton />
    </div>
  )
}

export default App
