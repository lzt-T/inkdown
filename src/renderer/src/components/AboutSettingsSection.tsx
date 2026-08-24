import { Download, Info, LoaderCircle, RefreshCw } from 'lucide-react'
import type { AppUpdateState } from '../../../shared/contracts'
import { Button } from '@/components/ui/button'
import type { UpdateCheckViewState } from '@/hooks/useAppUpdater'

interface AboutSettingsSectionProps {
  updateState: AppUpdateState | null
  currentVersion: string | null
  checkState: UpdateCheckViewState
  onCheckForUpdates: () => void
  onOpenUpdate: () => void
}

// Fixed check states map to concise inline feedback.
const UPDATE_CHECK_STATUS_LABELS: Record<
  Exclude<UpdateCheckViewState['status'], 'available'>,
  string
> = {
  idle: '启动时会自动检查更新',
  checking: '正在检查更新...',
  'up-to-date': '当前已是最新版本',
  unavailable: '开发环境不支持检查更新',
  error: '检查更新失败，请稍后重试'
}

// Actionable update states map to the next step available to the user.
const UPDATE_ACTION_STATUS_LABELS: Record<AppUpdateState['action'], string> = {
  download: '可供下载',
  install: '已准备就绪'
}

/** Renders application version details and the manual update action. */
export function AboutSettingsSection({
  updateState,
  currentVersion,
  checkState,
  onCheckForUpdates,
  onOpenUpdate
}: AboutSettingsSectionProps): React.JSX.Element {
  // Actionable update state takes precedence over the latest manual check result.
  const statusLabel = updateState
    ? `版本 ${updateState.version} ${UPDATE_ACTION_STATUS_LABELS[updateState.action]}`
    : checkState.status === 'available'
      ? checkState.version
        ? `发现版本 ${checkState.version}，正在后台下载`
        : '发现新版本，正在后台下载'
      : UPDATE_CHECK_STATUS_LABELS[checkState.status]
  // Pending state covers checks and downloads only before an action becomes available.
  const isPending =
    !updateState && (checkState.status === 'checking' || checkState.status === 'available')
  // Actionable updates open the existing detail dialog instead of checking again.
  const buttonLabel = updateState
    ? '查看更新'
    : checkState.status === 'checking'
      ? '正在检查'
      : checkState.status === 'available'
        ? '正在下载'
        : '检查更新'

  /** Routes the version action to checking or the existing update dialog. */
  const handleUpdateAction = (): void => {
    if (updateState) onOpenUpdate()
    else onCheckForUpdates()
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">关于</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        查看 Inkdown 版本并获取最新更新。
      </p>

      <div className="mt-7 max-w-2xl">
        <h3 className="text-sm font-medium text-foreground">版本</h3>
        <div className="mt-3 flex flex-col gap-4 border-y py-4 @min-[36rem]:flex-row @min-[36rem]:items-center @min-[36rem]:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Info className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Inkdown</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {currentVersion ? `版本 ${currentVersion}` : '正在读取版本...'}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{statusLabel}</p>
            </div>
          </div>
          <Button
            type="button"
            variant={updateState ? 'default' : 'outline'}
            disabled={isPending}
            onClick={handleUpdateAction}
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : updateState ? (
              <Download />
            ) : (
              <RefreshCw />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
