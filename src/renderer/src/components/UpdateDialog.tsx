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
    titleSuffix: '可用',
    description: 'macOS 版本需要从 GitHub Releases 下载并手动安装。',
    primaryLabel: '前往下载'
  },
  install: {
    titleSuffix: '已准备就绪',
    description: '更新已下载，重启 Inkdown 后即可完成安装。',
    primaryLabel: '立即重启'
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
  if (!updateState) return null

  // Current action selects the platform-specific title and primary command.
  const copy = UPDATE_DIALOG_COPY[updateState.action]
  // Dirty install copy explains the save step before restart.
  const description =
    updateState.action === 'install' && dirtyCount > 0
      ? `将先保存 ${dirtyCount} 个未保存文档，然后重启 Inkdown 完成安装。`
      : copy.description
  // Primary label names the save step only when it is required.
  const primaryLabel =
    updateState.action === 'install' && dirtyCount > 0 ? '保存并重启' : copy.primaryLabel
  // Update icon distinguishes external download from in-place installation.
  const UpdateIcon = UPDATE_ICONS[updateState.action]
  // Working label reflects whether the app is opening a page or saving documents.
  const workingLabel = updateState.action === 'download' ? '正在打开…' : '正在保存…'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!isWorking} className="sm:max-w-md">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UpdateIcon className="size-5" />
          </div>
          <DialogHeader className="min-w-0 flex-1 text-left">
            <DialogTitle>{`Inkdown ${updateState.version} ${copy.titleSuffix}`}</DialogTitle>
            <DialogDescription className="leading-6">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isWorking} onClick={() => onOpenChange(false)}>
            稍后
          </Button>
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
