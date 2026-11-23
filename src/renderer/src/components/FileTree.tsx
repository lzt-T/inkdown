import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { ChevronsDownUp, FilePlus, FolderOpen, FolderPlus, FolderX, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { FileNode } from '../../../shared/contracts'
import { EditingRow, TreeNode } from '@/components/FileTreeNode'
import {
  CREATE_DEFAULT_NAMES,
  getAvailableName,
  type EditingState
} from '@/components/file-tree-editing'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatErrorMessage } from '@/lib/error-message'
import { basename, dirname } from '@/lib/markdown-paths'
import { useEditorStore } from '@/store/editor-store'

interface FileTreeProps {
  editing: EditingState | null
  onEdit: React.Dispatch<React.SetStateAction<EditingState | null>>
}

interface HeaderIconActionProps {
  label: string
  children: React.ReactNode
  onClick: () => void
}

/** 渲染文件树头部轻量图标操作按钮，保持统一样式与提示。 */
function HeaderIconAction({ label, children, onClick }: HeaderIconActionProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="text-muted-foreground/75 hover:bg-accent hover:text-foreground"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** 渲染工作区文件树，包含头部快捷工具、空态引导与全键盘方向键导航。 */
export function FileTree({ editing, onEdit }: FileTreeProps): React.JSX.Element {
  useTranslation()

  const workspaceRoot = useEditorStore((state) => state.workspaceRoot)
  const treeNodes = useEditorStore((state) => state.treeNodes)
  const expandedDirs = useEditorStore((state) => state.expandedDirs)
  const openWorkspace = useEditorStore((state) => state.openWorkspace)
  const closeWorkspace = useEditorStore((state) => state.closeWorkspace)
  const collapseAllDirectories = useEditorStore((state) => state.collapseAllDirectories)
  const expandDirectory = useEditorStore((state) => state.expandDirectory)
  const collapseDirectory = useEditorStore((state) => state.collapseDirectory)
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderOpen className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">{t('workspace.no-folder-open')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('workspace.open-folder-hint')}
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-4"
          onClick={() => void openWorkspace()}
        >
          <FolderOpen />
          {t('workspace.open-folder')}
        </Button>
      </div>
    )
  }

  const workspaceName = basename(workspaceRoot) || workspaceRoot
  const rootNodes = treeNodes[workspaceRoot] ?? []
  const rootEditing =
    editing && editing.kind !== 'rename' && editing.parent === workspaceRoot ? editing : null

  /** 在工作区根目录启动新建 Markdown 或新建文件夹行内输入。 */
  function startRootCreate(kind: 'create-file' | 'create-folder'): void {
    const value = getAvailableName(t(CREATE_DEFAULT_NAMES[kind]), rootNodes)
    if (kind === 'create-file') {
      onEdit({
        kind: 'create-file',
        parent: workspaceRoot!,
        value,
        depth: 0,
        openAfterCreate: true,
        shouldFocus: true
      })
      return
    }
    onEdit({
      kind: 'create-folder',
      parent: workspaceRoot!,
      value,
      depth: 0,
      shouldFocus: true
    })
  }

  /** 更新当前树内编辑行的名称。 */
  function handleEditingValueChange(value: string): void {
    onEdit((current) => (current ? { ...current, value } : null))
  }

  /** 关闭编辑行并提交当前文件系统操作。 */
  function handleCommitEditing(value: string): void {
    if (!editing) return
    const currentEditing = editing
    onEdit(null)
    void commitEditing(currentEditing, value)
  }

  /** 确认后将目标移至回收站并刷新父目录。 */
  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return
    const target = pendingDelete
    try {
      await window.api.file.trash(target.path)
      await useEditorStore.getState().refreshDirectory(dirname(target.path))
      setPendingDelete(null)
      toast.success(t('workspace.moved-to-trash'))
    } catch (error) {
      toast.error(t('workspace.operation-failed'), { description: formatErrorMessage(error) })
    }
  }

  /** 支持树容器内方向键上下移动与左右展开折叠。 */
  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement) return
    const container = treeContainerRef.current
    if (!container) return
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="treeitem"]'))
    if (items.length === 0) return

    const activeElement = document.activeElement
    const currentIndex = activeElement instanceof HTMLButtonElement ? items.indexOf(activeElement) : -1
    if (currentIndex < 0) return
    const currentItem = items[currentIndex]

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[Math.min(currentIndex + 1, items.length - 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[Math.max(currentIndex - 1, 0)]?.focus()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      const path = currentItem.dataset.treePath
      if (!path || currentItem.dataset.nodeType !== 'directory') return
      if (currentItem.dataset.expanded !== 'true') {
        void expandDirectory(path)
      } else {
        items[currentIndex + 1]?.focus()
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const path = currentItem.dataset.treePath
      if (currentItem.dataset.nodeType === 'directory' && currentItem.dataset.expanded === 'true' && path) {
        collapseDirectory(path)
        return
      }
      const parentPath = currentItem.dataset.parentPath
      if (!parentPath) return
      const parentButton = items.find((item) => item.dataset.treePath === parentPath)
      parentButton?.focus()
    }
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div
          className="flex h-8 shrink-0 items-center justify-between gap-1 border-b px-2.5 text-xs font-medium text-panel-foreground"
          title={workspaceRoot}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{workspaceName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <HeaderIconAction
              label={t('workspace.new-markdown-file')}
              onClick={() => startRootCreate('create-file')}
            >
              <FilePlus />
            </HeaderIconAction>
            <HeaderIconAction
              label={t('workspace.new-folder')}
              onClick={() => startRootCreate('create-folder')}
            >
              <FolderPlus />
            </HeaderIconAction>
            <HeaderIconAction
              label={t('workspace.collapse-all')}
              onClick={collapseAllDirectories}
            >
              <ChevronsDownUp />
            </HeaderIconAction>
            <HeaderIconAction
              label={t('workspace.close-folder')}
              onClick={closeWorkspace}
            >
              <FolderX />
            </HeaderIconAction>
          </div>
        </div>
        <div
          ref={treeContainerRef}
          role="tree"
          aria-label={workspaceName}
          onKeyDown={handleTreeKeyDown}
          className="flex-1 space-y-0.5 overflow-auto px-2 py-2"
        >
          {rootEditing && (
            <EditingRow
              value={rootEditing.value}
              depth={0}
              nodeType={rootEditing.kind === 'create-file' ? 'file' : 'directory'}
              mode="create"
              shouldFocus={rootEditing.shouldFocus ?? false}
              onChange={handleEditingValueChange}
              onCancel={() => onEdit(null)}
              onCommit={handleCommitEditing}
              onFocused={() =>
                onEdit((current) =>
                  current && current.kind !== 'rename' ? { ...current, shouldFocus: false } : current
                )
              }
            />
          )}
          {rootNodes.length === 0 && !rootEditing ? (
            <div className="flex flex-col items-center px-3 py-8 text-center">
              <p className="text-xs text-muted-foreground">{t('workspace.no-markdown-files')}</p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-3"
                onClick={() => startRootCreate('create-file')}
              >
                <FilePlus />
                {t('workspace.new-markdown-file')}
              </Button>
            </div>
          ) : (
            rootNodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                parentPath={workspaceRoot}
                depth={0}
                expandedDirs={expandedDirs}
                treeNodes={treeNodes}
                editing={editing}
                onEdit={onEdit}
                onEditingValueChange={handleEditingValueChange}
                onCommitEdit={handleCommitEditing}
                onDeleteRequest={setPendingDelete}
              />
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <div className="flex items-start gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </div>
            <AlertDialogHeader className="min-w-0 flex-1">
              <AlertDialogTitle>
                {pendingDelete?.type === 'directory'
                  ? t('workspace.delete-folder')
                  : t('workspace.delete-file')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('workspace.delete-description', { name: pendingDelete?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('workspace.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleConfirmDelete()}>
              {t('workspace.move-to-trash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** 提交文件树的新建或重命名请求，并在失败时给出可读提示。 */
async function commitEditing(editing: EditingState, value: string): Promise<void> {
  if (!value) return
  try {
    if (editing.kind === 'create-file') {
      const file = await window.api.file.create(editing.parent, value)
      try {
        await useEditorStore.getState().refreshDirectory(editing.parent)
      } catch (error) {
        if (!editing.openAfterCreate) throw error
        toast.warning(t('workspace.unable-to-load-the-file-s-directory'), {
          description: formatErrorMessage(error)
        })
      }
      if (editing.openAfterCreate) await useEditorStore.getState().openPath(file.path)
    } else if (editing.kind === 'create-folder') {
      await window.api.file.createFolder(editing.parent, value)
      await useEditorStore.getState().refreshDirectory(editing.parent)
    } else {
      await window.api.file.rename(editing.path, value)
      await useEditorStore.getState().refreshDirectory(editing.parent)
    }
  } catch (error) {
    toast.error(t('workspace.operation-failed'), { description: formatErrorMessage(error) })
  }
}
