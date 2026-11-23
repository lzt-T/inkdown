import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Code2,
  Download,
  FilePlus,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Square,
  Sun,
  X
} from 'lucide-react'
import type { AppUpdateDownloadProgress, AppUpdateState } from '../../../shared/contracts'
import inkdownLogo from '@/assets/inkdown-logo.png'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatShortcut, IS_MAC } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

// Update action labels describe the command behind the temporary titlebar entry.
const UPDATE_ACTION_LABELS: Record<AppUpdateState['action'], string> = {
  download: 'workspace.view-available-update',
  install: 'workspace.install-downloaded-update'
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
  onNewFile: () => void
  onOpenUpdate: () => void
}

interface TitlebarActionProps {
  label: string
  shortcut?: string
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

/** 渲染桌面端窗口还原状态（双层重叠方框）图标，避免单一正方形旋转无辨识度。 */
function RestoreWindowIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5"
    >
      <path d="M5.5 4V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-1" />
      <rect x="2" y="5" width="8.5" height="8.5" rx="1" />
    </svg>
  )
}

/** Renders one labeled titlebar action with consistent interaction states. */
function TitlebarAction({
  label,
  shortcut,
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

  const accessibleLabel = shortcut ? `${label} (${shortcut})` : label

  return (
    <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
      <TooltipTrigger asChild onPointerMove={handlePointerMove}>
        <span className="app-no-drag inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={accessibleLabel}
            aria-pressed={isActive === undefined ? undefined : isActive}
            disabled={disabled}
            className={cn(
              'h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:translate-y-px active:bg-selected',
              isActive && 'bg-selected text-foreground',
              className,
              isHoverSuppressed && 'hover:bg-transparent dark:hover:bg-transparent'
            )}
            onClick={handleClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded bg-background/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-background/85">
            {shortcut}
          </kbd>
        )}
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
  onNewFile,
  onOpenUpdate
}: TitlebarProps): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Editor state and actions power the toolbar controls.
  const {
    activeKey,
    openDocs,
    tabOrder,
    sidebarOpen,
    mode,
    theme,
    toggleSidebar,
    toggleMode,
    toggleTheme
  } = useEditorStore()
  // Maximized state selects the correct native window affordance.
  const [maximized, setMaximized] = useState(false)
  // Active document provides the toolbar title and save state.
  const activeDoc = activeKey ? openDocs[activeKey] : null
  // Dirty state adds an unsaved indicator beside the document title.
  const dirty = activeDoc ? activeDoc.rawMarkdown !== activeDoc.savedRawMarkdown : false
  // 多标签页模式下 TabsBar 与文件树已展示文件名和目录名，顶栏居中留白减少冗余。
  const isSingleDocument = tabOrder.length === 1
  const centerTitle = isSettingsOpen
    ? t('workspace.settings')
    : isSingleDocument
      ? (activeDoc?.name ?? 'Inkdown')
      : tabOrder.length > 1
        ? ''
        : 'Inkdown'

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

  return (
    <header className="app-drag flex h-10 shrink-0 items-center border-b bg-panel px-2.5 text-muted-foreground">
      <div className={cn('flex min-w-0 items-center gap-0.5', IS_MAC && 'pl-16')}>
        <img
          src={inkdownLogo}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none mx-1 size-4.5 shrink-0 select-none"
        />
        {!isSettingsOpen && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <TitlebarAction
              label={t('workspace.toggle-sidebar')}
              shortcut={formatShortcut(['B'])}
              isActive={sidebarOpen}
              onClick={toggleSidebar}
            >
              {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </TitlebarAction>
            <TitlebarAction
              label={t('workspace.new-file')}
              shortcut={formatShortcut(['N'])}
              onClick={onNewFile}
            >
              <FilePlus />
            </TitlebarAction>
          </>
        )}
      </div>

      <div className="mx-4 flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="truncate text-xs font-medium text-foreground">{centerTitle}</span>
        {!isSettingsOpen && isSingleDocument && dirty && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-info/12 px-2 py-0.5 text-[11px] font-medium text-info"
            title={t('workspace.unsaved')}
          >
            <span className="size-1.5 rounded-full bg-info" aria-hidden="true" />
            {t('workspace.unsaved')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {!isSettingsOpen && (
          <>
            <TitlebarAction
              label={t('workspace.toggle-source-mode')}
              shortcut={formatShortcut(['/'])}
              isActive={mode === 'source'}
              onClick={toggleMode}
            >
              <Code2 />
            </TitlebarAction>
            <TitlebarAction
              label={t('workspace.toggle-theme')}
              shortcut={formatShortcut(['Shift', 'T'])}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </TitlebarAction>
            {downloadProgress ? (
              <TitlebarAction
                label={t('workspace.downloading-value', { v0: downloadProgress.percent })}
                className="text-info disabled:opacity-100"
                disabled
              >
                <DownloadProgressIcon percent={downloadProgress.percent} />
              </TitlebarAction>
            ) : updateState ? (
              <TitlebarAction
                label={t(UPDATE_ACTION_LABELS[updateState.action])}
                className="relative text-info hover:text-info"
                onClick={onOpenUpdate}
              >
                <Download />
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-info ring-2 ring-panel" />
              </TitlebarAction>
            ) : null}
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>
        )}
        <TitlebarAction
          label={isSettingsOpen ? t('workspace.back-to-editor') : t('workspace.open-settings')}
          shortcut={isSettingsOpen ? 'Esc' : formatShortcut([','])}
          isActive={isSettingsOpen}
          onClick={isSettingsOpen ? onReturnToEditor : onOpenSettings}
        >
          <Settings />
        </TitlebarAction>

        {!IS_MAC && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <TitlebarAction
              label={t('workspace.minimize')}
              suppressHoverAfterClick
              onClick={() => void window.api.window.minimize()}
            >
              <Minus />
            </TitlebarAction>
            <TitlebarAction
              label={maximized ? t('workspace.restore') : t('workspace.maximize')}
              onClick={() => void window.api.window.toggleMaximize()}
            >
              {maximized ? <RestoreWindowIcon /> : <Square className="size-3.5" />}
            </TitlebarAction>
            <TitlebarAction
              label={t('workspace.close')}
              className="hover:bg-destructive hover:text-destructive-foreground dark:hover:bg-destructive"
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
