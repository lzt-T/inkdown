import { useEffect, useState, type ReactNode } from 'react'
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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

interface TitlebarProps {
  isSettingsOpen: boolean
  onOpenSettings: () => void
  onReturnToEditor: () => void
}

interface TitlebarActionProps {
  label: string
  children: ReactNode
  disabled?: boolean
  isActive?: boolean
  onClick: () => void
}

/** Renders one labeled titlebar action with consistent interaction states. */
function TitlebarAction({
  label,
  children,
  disabled,
  isActive,
  onClick
}: TitlebarActionProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="app-no-drag inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={isActive === undefined ? undefined : isActive}
            disabled={disabled}
            className={cn(
              'h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:translate-y-px active:bg-selected',
              isActive && 'bg-selected text-primary'
            )}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
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
    <header className="app-drag flex h-10 shrink-0 items-center border-b bg-panel px-2 text-muted-foreground">
      <div className={cn('flex min-w-0 items-center gap-0.5', isMac && 'pl-16')}>
        <TitlebarAction label="切换文件树" isActive={sidebarOpen} onClick={toggleSidebar}>
          {sidebarOpen ? <PanelLeftOpen /> : <PanelLeftClose />}
        </TitlebarAction>
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <TitlebarAction label="新建文件" onClick={handleNewFile}>
          <FilePlus />
        </TitlebarAction>
        <TitlebarAction label="打开文件" onClick={handleOpenFile}>
          <FileText />
        </TitlebarAction>
        <TitlebarAction label="打开文件夹" onClick={handleOpenWorkspace}>
          <FolderOpen />
        </TitlebarAction>
        <TitlebarAction label="保存" disabled={!activeDoc} onClick={() => void saveActive()}>
          <Save />
        </TitlebarAction>
      </div>

      <div className="mx-4 flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {isSettingsOpen ? '设置' : (activeDoc?.name ?? 'Inkdown')}
        </span>
        {!isSettingsOpen && dirty && <span className="text-[11px] text-primary">未保存</span>}
      </div>

      <div className="flex items-center gap-0.5">
        <TitlebarAction label="切换大纲" isActive={outlineOpen} onClick={toggleOutline}>
          <ListTree />
        </TitlebarAction>
        <TitlebarAction label="切换源码模式" isActive={mode === 'source'} onClick={toggleMode}>
          <Code2 />
        </TitlebarAction>
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <TitlebarAction
          label={isSettingsOpen ? '返回编辑器' : '打开设置'}
          isActive={isSettingsOpen}
          onClick={isSettingsOpen ? onReturnToEditor : onOpenSettings}
        >
          <Settings />
        </TitlebarAction>

        {!isMac && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <TitlebarAction label="最小化" onClick={() => void window.api.window.minimize()}>
              <Minus />
            </TitlebarAction>
            <TitlebarAction
              label={maximized ? '还原' : '最大化'}
              onClick={() => void window.api.window.toggleMaximize()}
            >
              <Square className={cn(maximized && 'rotate-180')} />
            </TitlebarAction>
            <TitlebarAction label="关闭" onClick={() => void window.api.window.close()}>
              <X />
            </TitlebarAction>
          </>
        )}
      </div>
    </header>
  )
}
