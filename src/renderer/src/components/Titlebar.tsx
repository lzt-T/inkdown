import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Code2,
  Download,
  FilePlus,
  FileText,
  FolderOpen,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Settings,
  Square,
  X
} from 'lucide-react'
import type { AppUpdateDownloadProgress, AppUpdateState } from '../../../shared/contracts'
import inkdownLogo from '@/assets/inkdown-logo.png'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

// Update action labels describe the command behind the temporary titlebar entry.
const UPDATE_ACTION_LABELS: Record<AppUpdateState['action'], string> = {
  download: '查看可用更新',
  install: '安装已下载更新'
}

// Progress ring radius leaves room for the stroke inside its view box.
const DOWNLOAD_PROGRESS_RADIUS = 8
// Progress ring circumference converts a percentage into an SVG dash offset.
const DOWNLOAD_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * DOWNLOAD_PROGRESS_RADIUS

interface TitlebarProps {
  isSettingsOpen: boolean
  updateState: AppUpdateState | null
  downloadProgress: AppUpdateDownloadProgress | null
  onOpenSettings: () => void
  onReturnToEditor: () => void
  onOpenUpdate: () => void
}

interface TitlebarActionProps {
  label: string
  children: ReactNode
  className?: string
  disabled?: boolean
  isActive?: boolean
  suppressHoverAfterClick?: boolean
  onClick?: () => void
}

interface DownloadProgressIconProps {
  percent: number
}

/** Renders download progress as a compact circular titlebar indicator. */
function DownloadProgressIcon({ percent }: DownloadProgressIconProps): React.JSX.Element {
  // Dash offset reveals the completed portion clockwise from the top.
  const dashOffset = DOWNLOAD_PROGRESS_CIRCUMFERENCE * (1 - percent / 100)

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 -rotate-90">
      <circle
        cx="10"
        cy="10"
        r={DOWNLOAD_PROGRESS_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-20"
      />
      <circle
        cx="10"
        cy="10"
        r={DOWNLOAD_PROGRESS_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={DOWNLOAD_PROGRESS_CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

/** Renders one labeled titlebar action with consistent interaction states. */
function TitlebarAction({
  label,
  children,
  className,
  disabled,
  isActive,
  suppressHoverAfterClick,
  onClick
}: TitlebarActionProps): React.JSX.Element {
  // 受控状态确保窗口隐藏前能够主动关闭提示。
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  // 最小化恢复前隐藏由静止指针保留的悬停背景。
  const [isHoverSuppressed, setIsHoverSuppressed] = useState(false)
  // 点击位置用于阻止窗口恢复时由同一指针位置重新打开提示。
  const suppressedPointerPosition = useRef<{ x: number; y: number } | null>(null)

  /** 根据当前指针抑制状态同步提示的打开状态。 */
  const handleTooltipOpenChange = (open: boolean): void => {
    if (open && suppressedPointerPosition.current) return
    setIsTooltipOpen(open)
  }

  /** 在用户真实移动指针后恢复提示的悬停行为。 */
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    // 当前抑制位置为空时无需比较指针坐标。
    const position = suppressedPointerPosition.current
    if (!position) return
    if (event.screenX === position.x && event.screenY === position.y) return
    suppressedPointerPosition.current = null
    setIsHoverSuppressed(false)
  }

  /** 关闭当前提示后执行标题栏动作。 */
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    // 键盘触发的点击没有鼠标点击次数，不应抑制后续焦点提示。
    const isPointerClick = event.detail > 0
    suppressedPointerPosition.current =
      isPointerClick ? { x: event.screenX, y: event.screenY } : null
    setIsHoverSuppressed(Boolean(suppressHoverAfterClick && isPointerClick))
    setIsTooltipOpen(false)
    onClick?.()
  }

  return (
    <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
      <TooltipTrigger asChild onPointerMove={handlePointerMove}>
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
              isActive && 'bg-selected text-primary',
              className,
              isHoverSuppressed && 'hover:bg-transparent dark:hover:bg-transparent'
            )}
            onClick={handleClick}
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
  updateState,
  downloadProgress,
  onOpenSettings,
  onReturnToEditor,
  onOpenUpdate
}: TitlebarProps): React.JSX.Element {
  // Editor state and actions power the toolbar controls.
  const {
    activeKey,
    openDocs,
    sidebarOpen,
    mode,
    toggleSidebar,
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
        <img
          src={inkdownLogo}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none mx-0.5 size-4.5 shrink-0 select-none opacity"
        />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <TitlebarAction label="切换侧栏" isActive={sidebarOpen} onClick={toggleSidebar}>
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
        <TitlebarAction label="切换源码模式" isActive={mode === 'source'} onClick={toggleMode}>
          <Code2 />
        </TitlebarAction>
        {downloadProgress ? (
          <TitlebarAction
            label={`正在下载 ${downloadProgress.percent}%`}
            className="text-primary disabled:opacity-100"
            disabled
          >
            <DownloadProgressIcon percent={downloadProgress.percent} />
          </TitlebarAction>
        ) : updateState ? (
          <TitlebarAction
            label={UPDATE_ACTION_LABELS[updateState.action]}
            className="relative text-primary hover:text-primary"
            onClick={onOpenUpdate}
          >
            <Download />
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-panel" />
          </TitlebarAction>
        ) : null}
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
            <TitlebarAction
              label="最小化"
              suppressHoverAfterClick
              onClick={() => void window.api.window.minimize()}
            >
              <Minus />
            </TitlebarAction>
            <TitlebarAction
              label={maximized ? '还原' : '最大化'}
              onClick={() => void window.api.window.toggleMaximize()}
            >
              <Square className={cn(maximized && 'rotate-180')} />
            </TitlebarAction>
            <TitlebarAction
              label="关闭"
              className="hover:bg-destructive hover:text-white dark:hover:bg-destructive"
              onClick={() => void window.api.window.close()}
            >
              <X />
            </TitlebarAction>
          </>
        )}
      </div>
    </header>
  )
}
