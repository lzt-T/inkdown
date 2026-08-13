import { useEffect, useState } from 'react'
import {
  Code2,
  FilePlus,
  FileText,
  FolderOpen,
  ListTree,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Square,
  Sun,
  X
} from 'lucide-react'
import { useEditorStore } from '../store/editor-store'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { cn } from '../lib/utils'

export function Titlebar(): React.JSX.Element {
  const {
    activeKey,
    openDocs,
    sidebarOpen,
    outlineOpen,
    theme,
    mode,
    toggleSidebar,
    toggleOutline,
    toggleTheme,
    toggleMode,
    newUntitled,
    openWorkspace,
    openFileDialog,
    saveActive
  } = useEditorStore()
  const [maximized, setMaximized] = useState(false)
  const activeDoc = activeKey ? openDocs[activeKey] : null
  const dirty = activeDoc ? activeDoc.rawMarkdown !== activeDoc.savedRawMarkdown : false

  useEffect(() => {
    let mounted = true
    void window.api.window.isMaximized().then((value) => {
      if (mounted) setMaximized(value)
    })
    const unsubscribe = window.api.window.onMaximizedChanged(setMaximized)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

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
          onClick={newUntitled}
          title="新建文件"
        >
          <FilePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={() => void openFileDialog()}
          title="打开文件"
        >
          <FolderOpen />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="app-no-drag h-7 w-7"
          onClick={() => void openWorkspace()}
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
        <span className="truncate text-sm text-foreground">{activeDoc?.name ?? 'Inkdown'}</span>
        {dirty && <span className="text-xs text-muted-foreground">未保存</span>}
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
          onClick={toggleTheme}
          title="切换主题"
        >
          {theme === 'light' ? <Moon /> : <Sun />}
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
