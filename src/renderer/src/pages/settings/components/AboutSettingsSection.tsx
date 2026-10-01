import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { Download, Info, LoaderCircle, RefreshCw } from 'lucide-react'
import type { AppUpdateState } from '../../../../../shared/contracts'
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
  idle: 'settings.updates-are-checked-automatically-at-startup',
  checking: 'settings.checking-for-updates',
  'up-to-date': 'settings.you-are-up-to-date',
  unavailable: 'settings.update-checks-are-unavailable-in-development',
  error: 'settings.update-check-failed-try-again-later'
}

// Actionable update states map to the next step available to the user.
const UPDATE_ACTION_STATUS_LABELS: Record<AppUpdateState['action'], string> = {
  download: 'settings.available-to-download',
  install: 'settings.ready'
}

/** Renders application version details and the manual update action. */
export function AboutSettingsSection({
  updateState,
  currentVersion,
  checkState,
  onCheckForUpdates,
  onOpenUpdate
}: AboutSettingsSectionProps): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Actionable update state takes precedence over the latest manual check result.
  const statusLabel = updateState
    ? t('settings.version-value-value', { v0: updateState.version, v1: t(UPDATE_ACTION_STATUS_LABELS[updateState.action]) })
    : checkState.status === 'available'
      ? checkState.version
        ? t('settings.version-value-found-downloading-in-the-background', { v0: checkState.version })
        : t('settings.new-version-found-downloading-in-the-background')
      : t(UPDATE_CHECK_STATUS_LABELS[checkState.status])
  // Pending state covers checks and downloads only before an action becomes available.
  const isPending =
    !updateState && (checkState.status === 'checking' || checkState.status === 'available')
  // Actionable updates open the existing detail dialog instead of checking again.
  const buttonLabel = updateState
    ? t('settings.view-update')
    : checkState.status === 'checking'
      ? t('settings.checking')
      : checkState.status === 'available'
        ? t('settings.downloading')
        : t('settings.check-for-updates')

  /** Routes the version action to checking or the existing update dialog. */
  const handleUpdateAction = (): void => {
    if (updateState) onOpenUpdate()
    else onCheckForUpdates()
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">{t('settings.about')}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('settings.view-the-inkdown-version-and-get-updates')}</p>

      <div className="mt-7 max-w-2xl">
        <h3 className="text-sm font-medium text-foreground">{t('settings.version')}</h3>
        <div className="mt-3 flex flex-col gap-4 border-y py-4 @min-[36rem]:flex-row @min-[36rem]:items-center @min-[36rem]:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Info className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Inkdown</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {currentVersion ? t('settings.version-value', { v0: currentVersion }) : t('settings.loading-version')}
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
