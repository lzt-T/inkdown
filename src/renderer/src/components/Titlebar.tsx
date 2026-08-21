import { useEffect, useState } from 'react'
import {
  Code2,
  FilePlus,
  FileText,
  FolderOpen,
  ListTree,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Settings,
  Square,
  X
} from 'lucide-react'
import { useEditorStore } from '../store/editor-store'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { cn } from '../lib/utils'

interface TitlebarProps {
  isSettingsOpen: boolean
  onOpenSettings: () => void
  onReturnToEditor: () => void
}

/** Renders the native window toolbar and primary editor actions. */
export function Titlebar({
  isSettingsOpen,
  onOpenSettings,
  onReturnToEditor
}: TitlebarProps): React.JSX.Element {
  // Editor state and actions power the toolbar controls.
  const {
    activeKey,
    openDocs,
    sidebarOpen,
    outlineOpen,
    mode,
    toggleSidebar,
    toggleOutline,
    toggleMode,
    newUntitled,
    openWorkspace,
    openFileDialog,
    saveActive
  } = useEditorStore()
  // Maximized state selects the correct native window affordance.
  const [maximized, setMaximized] = useState(false)
  // Active document provides the toolbar title and save state.
  const activeDoc = activeKey ? openDocs[activeKey] : null
  // Dirty state adds an unsaved indicator beside the document title.
  const dirty = activeDoc ? activeDoc.rawMarkdown !== activeDoc.savedRawMarkdown : false

  /** Creates a document and restores the editor workspace. */
  const handleNewFile = (): void => {
    onReturnToEditor()
    newUntitled()
  }

  /** Opens the file picker and restores the editor workspace. */
  const handleOpenFile = (): void => {
    onReturnToEditor()
    void openFileDialog()
  }

  /** Opens the workspace picker and restores the editor workspace. */
  const handleOpenWorkspace = (): void => {
    onReturnToEditor()
    void openWorkspace()
  }

  useEffect(() => {
    // Mounted guard prevents stale native window updates.
    let mounted = true
    void window.api.window.isMaximized().then((value) => {
      if (mounted) setMaximized(value)
    })
    // Native subscription keeps the maximize affordance synchronized.
    const unsubscribe = window.api.window.onMaximizedChanged(setMaximized)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // macOS reserves toolbar space for native traffic-light controls.
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <header className="app-drag flex h-10 shrink-0 items-center border-b bg-card/80 px-2 text-muted-foreground">
      <div className={cn('flex min-w-0 items-center gap-1', isMac && 'pl-16')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={toggleSidebar}
          title="切换文件树"
        >
          {sidebarOpen ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={handleNewFile}
          title="新建文件"
        >
          <FilePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={handleOpenFile}
          title="打开文件"
        >
          <FolderOpen />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={handleOpenWorkspace}
          title="打开文件夹"
        >
          <FileText />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={() => void saveActive()}
          disabled={!activeDoc}
          title="保存"
        >
          <Save />
        </Button>
      </div>

      <div className="mx-3 flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="truncate text-sm text-foreground">
          {isSettingsOpen ? '设置' : (activeDoc?.name ?? 'Inkdown')}
        </span>
        {!isSettingsOpen && dirty && <span className="text-xs text-muted-foreground">未保存</span>}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={toggleOutline}
          title="切换大纲"
        >
          <ListTree className={cn(outlineOpen && 'text-primary')} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={toggleMode}
          title="切换源码模式"
        >
          <Code2 className={cn(mode === 'source' && 'text-primary')} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={isSettingsOpen ? onReturnToEditor : onOpenSettings}
          title={isSettingsOpen ? '返回编辑器' : '打开设置'}
        >
          <Settings className={cn(isSettingsOpen && 'text-primary')} />
        </Button>

        {!isMac && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag h-7 w-7"
              onClick={() => void window.api.window.minimize()}
              title="最小化"
            >
              <Minus />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag h-7 w-7"
              onClick={() => void window.api.window.toggleMaximize()}
              title={maximized ? '还原' : '最大化'}
            >
              <Square className={cn(maximized && 'rotate-180')} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => void window.api.window.close()}
              title="关闭"
            >
              <X />
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
