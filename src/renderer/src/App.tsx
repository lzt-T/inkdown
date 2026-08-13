import { useEffect, useMemo } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Toaster as SonnerToaster } from 'sonner'
import { useEditorStore } from './store/editor-store'
import { Titlebar } from './components/Titlebar'
import { FileTree } from './components/FileTree'
import { EditorPane } from './components/EditorPane'
import { OutlinePanel } from './components/OutlinePanel'
import { StatusBar } from './components/StatusBar'
import { parseOutline } from './lib/outline'

function App(): React.JSX.Element {
  const theme = useEditorStore((state) => state.theme)
  const sidebarOpen = useEditorStore((state) => state.sidebarOpen)
  const outlineOpen = useEditorStore((state) => state.outlineOpen)
  const activeKey = useEditorStore((state) => state.activeKey)
  const activeRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.rawMarkdown ?? null) : null
  )
  const activeSavedRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.savedRawMarkdown ?? null) : null
  )
  const activeDiskPath = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.diskPath ?? null) : null
  )
  const dirtyCount = useEditorStore(
    (state) =>
      Object.values(state.openDocs).filter((doc) => doc.rawMarkdown !== doc.savedRawMarkdown).length
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    void window.api.settings.set({ theme })
  }, [theme])

  useEffect(() => {
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
      const store = useEditorStore.getState()
      switch (action) {
        case 'new-file':
          store.newUntitled()
          break
        case 'open-file':
          void store.openFileDialog()
          break
        case 'open-workspace':
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
    const timer = window.setTimeout(() => {
      void useEditorStore.getState().saveDocument(activeKey)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [activeKey, activeDiskPath, activeRawMarkdown, activeSavedRawMarkdown])

  const outlineItems = useMemo(() => parseOutline(activeRawMarkdown ?? ''), [activeRawMarkdown])

  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Group orientation="horizontal" id="inkdown.panels" className="flex min-w-0 flex-1">
          {sidebarOpen && (
            <>
              <Panel defaultSize="18" minSize="12" maxSize="32" className="border-r bg-card/50">
                <FileTree />
              </Panel>
              <Separator className="w-px bg-border transition-colors hover:bg-primary/50" />
            </>
          )}
          <Panel minSize="35" className="min-w-0">
            <EditorPane />
          </Panel>
          {outlineOpen && (
            <>
              <Separator className="w-px bg-border transition-colors hover:bg-primary/50" />
              <Panel defaultSize="16" minSize="12" maxSize="28" className="border-l bg-card/50">
                <OutlinePanel items={outlineItems} />
              </Panel>
            </>
          )}
        </Group>
      </div>
      <StatusBar />
      <SonnerToaster theme={theme} position="bottom-right" richColors closeButton />
    </div>
  )
}

export default App
