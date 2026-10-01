import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { Download, ExternalLink, LoaderCircle, RotateCw, type LucideIcon } from 'lucide-react'
import type { AppUpdateState } from '../../../shared/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface UpdateDialogProps {
  updateState: AppUpdateState | null
  dirtyCount: number
  isOpen: boolean
  isWorking: boolean
  onOpenChange: (open: boolean) => void
  onPrimaryAction: () => void
}

interface UpdateDialogCopy {
  titleSuffix: string
  description: string
  primaryLabel: string
}

// Dialog copy maps each platform action to its fixed update behavior.
const UPDATE_DIALOG_COPY: Record<AppUpdateState['action'], UpdateDialogCopy> = {
  download: {
    titleSuffix: 'workspace.available',
    description: 'workspace.download-the-macos-version-from-github-releases-and-install-it-manually',
    primaryLabel: 'workspace.download'
  },
  install: {
    titleSuffix: 'workspace.ready',
    description: 'workspace.the-update-is-downloaded-restart-inkdown-to-install-it',
    primaryLabel: 'workspace.restart-now'
  }
}

// Update icons map each action to its familiar visual command.
const UPDATE_ICONS: Record<AppUpdateState['action'], LucideIcon> = {
  download: Download,
  install: RotateCw
}

/** Presents actionable update details without interrupting the editing session. */
export function UpdateDialog({
  updateState,
  dirtyCount,
  isOpen,
  isWorking,
  onOpenChange,
  onPrimaryAction
}: UpdateDialogProps): React.JSX.Element | null {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  if (!updateState) return null

  // Current action selects the platform-specific title and primary command.
  const copy = UPDATE_DIALOG_COPY[updateState.action]
  // Dirty install copy explains the save step before restart.
  const description =
    updateState.action === 'install' && dirtyCount > 0
      ? t('workspace.save-before-update', { count: dirtyCount })
      : t(copy.description)
  // Primary label names the save step only when it is required.
  const primaryLabel =
    updateState.action === 'install' && dirtyCount > 0 ? t('workspace.save-and-restart') : t(copy.primaryLabel)
  // Update icon distinguishes external download from in-place installation.
  const UpdateIcon = UPDATE_ICONS[updateState.action]
  // Working label reflects whether the app is opening a page or saving documents.
  const workingLabel = updateState.action === 'download' ? t('workspace.opening') : t('workspace.saving-2')

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!isWorking} className="sm:max-w-md">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UpdateIcon className="size-5" />
          </div>
          <DialogHeader className="min-w-0 flex-1 text-left">
            <DialogTitle>{`Inkdown ${updateState.version} ${t(copy.titleSuffix)}`}</DialogTitle>
            <DialogDescription className="leading-6">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isWorking} onClick={() => onOpenChange(false)}>{t('workspace.later')}</Button>
          <Button disabled={isWorking} onClick={onPrimaryAction}>
            {isWorking ? (
              <LoaderCircle className="animate-spin" />
            ) : updateState.action === 'download' ? (
              <ExternalLink />
            ) : (
              <RotateCw />
            )}
            {isWorking ? workingLabel : primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
