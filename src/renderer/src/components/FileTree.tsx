import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  FilePlus,
  FolderPlus,
  ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import type { FileNode } from '../../../shared/contracts'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { basename, dirname } from '@/lib/markdown-paths'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

type EditingState =
  | {
      kind: 'rename'
      path: string
      value: string
      parent: string
      depth: number
      nodeType: FileNode['type']
    }
  | { kind: 'create-file'; parent: string; value: string; depth: number }
  | { kind: 'create-folder'; parent: string; value: string; depth: number }

interface TreeNodeProps {
  node: FileNode
  depth: number
  expandedDirs: string[]
  treeNodes: Record<string, FileNode[]>
  editing: EditingState | null
  onEdit: (editing: EditingState | null) => void
  onEditingValueChange: (value: string) => void
  onCommitEdit: (value: string) => void
  onDeleteRequest: (node: FileNode) => void
}

interface EditingRowProps {
  value: string
  depth: number
  nodeType: FileNode['type']
  isDirectoryExpanded?: boolean
  shouldFocus: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
  onFocused: () => void
}

// 新建类型映射到对应的中文默认名称。
const CREATE_DEFAULT_NAMES: Record<'create-file' | 'create-folder', string> = {
  'create-file': '未命名.md',
  'create-folder': '新建文件夹'
}

/** Renders the active workspace as an editable Markdown file tree. */
export function FileTree(): React.JSX.Element {
  // Workspace root labels the panel and scopes root nodes.
  const workspaceRoot = useEditorStore((state) => state.workspaceRoot)
  // Tree nodes provide directory children by absolute path.
  const treeNodes = useEditorStore((state) => state.treeNodes)
  // Expanded directories control visible tree branches.
  const expandedDirs = useEditorStore((state) => state.expandedDirs)
  // 单一编辑状态确保任意层级只显示一个临时节点。
  const [editing, setEditing] = useState<EditingState | null>(null)
  // 待删除节点用于驱动文件和文件夹共用的确认弹窗。
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null)

  if (!workspaceRoot) return <div className="p-4 text-sm text-muted-foreground">未打开文件夹</div>

  // Workspace name keeps the panel label concise while the title preserves the full path.
  const workspaceName = basename(workspaceRoot) || workspaceRoot
  // Root nodes populate the first visible tree level.
  const rootNodes = treeNodes[workspaceRoot] ?? []

  /** 更新当前树内编辑行的名称。 */
  function handleEditingValueChange(value: string): void {
    setEditing((current) => (current ? { ...current, value } : null))
  }

  /** 关闭编辑行并提交当前文件系统操作。 */
  function handleCommitEditing(value: string): void {
    if (!editing) return
    // 提交前关闭编辑行，避免回车与失焦重复触发操作。
    const currentEditing = editing
    setEditing(null)
    void commitEditing(currentEditing, value)
  }

  /** 确认后将目标移至回收站并刷新父目录。 */
  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return
    // 当前目标在异步删除期间保持稳定。
    const target = pendingDelete
    await window.api.file.trash(target.path)
    await useEditorStore.getState().refreshDirectory(dirname(target.path))
    setPendingDelete(null)
    toast.success('已移至回收站')
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div
          className="flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs font-medium text-panel-foreground"
          title={workspaceRoot}
        >
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{workspaceName}</span>
        </div>
        <div className="flex-1 overflow-auto py-1.5">
          {rootNodes.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              暂无 Markdown 文件
            </div>
          ) : (
            rootNodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expandedDirs={expandedDirs}
                treeNodes={treeNodes}
                editing={editing}
                onEdit={setEditing}
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
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.type === 'directory' ? '删除文件夹？' : '删除文件？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              确定要将“{pendingDelete?.name}”移至回收站吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleConfirmDelete()}>
              移至回收站
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Renders one recursive file or directory row. */
function TreeNode({
  node,
  depth,
  expandedDirs,
  treeNodes,
  editing,
  onEdit,
  onEditingValueChange,
  onCommitEdit,
  onDeleteRequest
}: TreeNodeProps): React.JSX.Element {
  // File action opens the selected Markdown document.
  const openPath = useEditorStore((state) => state.openPath)
  // Expand action loads and reveals a directory branch.
  const expandDirectory = useEditorStore((state) => state.expandDirectory)
  // Collapse action hides a directory branch.
  const collapseDirectory = useEditorStore((state) => state.collapseDirectory)
  // Active key identifies the selected file row.
  const activeKey = useEditorStore((state) => state.activeKey)
  // 菜单关闭后才允许编辑框请求焦点。
  const [shouldFocusEditing, setShouldFocusEditing] = useState(false)
  // 菜单编辑意图跨越菜单卸载过程且无需触发渲染。
  const isEditingFromMenuRef = useRef(false)
  // Active state highlights the currently edited file.
  const active = node.type === 'file' && node.path === activeKey
  // Directory children render below expanded branches.
  const children = node.type === 'directory' ? treeNodes[node.path] ?? [] : []
  // Expanded state selects the directory affordance and children.
  const isExpanded = node.type === 'directory' && expandedDirs.includes(node.path)
  // 当前重命名状态在原位置替换对应节点。
  const renameEditing = editing?.kind === 'rename' && editing.path === node.path ? editing : null
  // 当前新建状态只在目标目录末尾追加一个临时子节点。
  const childEditing = editing && editing.kind !== 'rename' && editing.parent === node.path ? editing : null

  /** Opens a file or toggles the current directory. */
  const handleOpen = (): void => {
    if (node.type === 'file') void openPath(node.path)
    else if (isExpanded) collapseDirectory(node.path)
    else void expandDirectory(node.path)
  }

  /** 展开目标目录并显示带默认名称的新建节点。 */
  const handleStartCreate = async (kind: 'create-file' | 'create-folder'): Promise<void> => {
    isEditingFromMenuRef.current = true
    setShouldFocusEditing(false)
    if (!isExpanded) await expandDirectory(node.path)
    // 展开后的最新子节点用于处理首次加载目录中的名称冲突。
    const directoryNodes = useEditorStore.getState().treeNodes[node.path] ?? []
    // 当前目录名称用于生成提交前即可见的唯一默认名称。
    const value = getAvailableName(CREATE_DEFAULT_NAMES[kind], directoryNodes)
    onEdit({ kind, parent: node.path, value, depth: depth + 1 })
  }

  return (
    <div>
      {renameEditing ? (
        <EditingRow
          value={renameEditing.value}
          depth={renameEditing.depth}
          nodeType={renameEditing.nodeType}
          isDirectoryExpanded={isExpanded}
          shouldFocus={shouldFocusEditing}
          onChange={onEditingValueChange}
          onCancel={() => onEdit(null)}
          onCommit={onCommitEdit}
          onFocused={() => setShouldFocusEditing(false)}
        />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              className={cn(
                'group relative flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-panel-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                active && 'font-semibold text-primary'
              )}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={handleOpen}
              onDoubleClick={node.type === 'file' ? handleOpen : undefined}
              title={node.path}
            >
              {node.type === 'directory' ? (
                isExpanded ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              {node.type === 'directory' ? (
                isExpanded ? (
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <FileText
                  className={cn('size-4 shrink-0 text-muted-foreground', active && 'text-primary')}
                />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent
            className="w-44"
            onCloseAutoFocus={(event) => {
              if (!isEditingFromMenuRef.current) return
              event.preventDefault()
              isEditingFromMenuRef.current = false
              setShouldFocusEditing(true)
            }}
          >
            {node.type === 'file' ? (
              <ContextMenuItem onSelect={handleOpen}>打开</ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={handleOpen}>{isExpanded ? '折叠' : '展开'}</ContextMenuItem>
            )}
            {node.type === 'directory' && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void handleStartCreate('create-file')}>
                  <FilePlus /> 新建 Markdown
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void handleStartCreate('create-folder')}>
                  <FolderPlus /> 新建文件夹
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                isEditingFromMenuRef.current = true
                setShouldFocusEditing(false)
                onEdit({
                  kind: 'rename',
                  path: node.path,
                  value: node.name,
                  parent: dirname(node.path),
                  depth,
                  nodeType: node.type
                })
              }}
            >
              <Pencil /> 重命名
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onDeleteRequest(node)}>
              <Trash2 /> 删除
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void window.api.file.reveal(node.path)}>
              <ExternalLink /> 在资源管理器中显示
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {isExpanded && (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-border/80"
            style={{ left: 17 + depth * 14 }}
          />
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              treeNodes={treeNodes}
              editing={editing}
              onEdit={onEdit}
              onEditingValueChange={onEditingValueChange}
              onCommitEdit={onCommitEdit}
              onDeleteRequest={onDeleteRequest}
            />
          ))}
          {childEditing && (
            <EditingRow
              value={childEditing.value}
              depth={childEditing.depth}
              nodeType={childEditing.kind === 'create-file' ? 'file' : 'directory'}
              shouldFocus={shouldFocusEditing}
              onChange={onEditingValueChange}
              onCancel={() => onEdit(null)}
              onCommit={onCommitEdit}
              onFocused={() => setShouldFocusEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** Renders the inline input used for creating and renaming tree entries. */
function EditingRow({
  value,
  depth,
  nodeType,
  isDirectoryExpanded = false,
  shouldFocus,
  onChange,
  onCommit,
  onCancel,
  onFocused
}: EditingRowProps): React.JSX.Element {
  // 名称输入框引用用于在右键菜单完全关闭后获取焦点。
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!shouldFocus) return
    // 下一帧聚焦确保菜单焦点范围已经完成卸载。
    const animationFrameId = window.requestAnimationFrame(() => {
      // 已挂载输入框接收焦点并完整选中默认名称。
      const input = inputRef.current
      if (!input) return
      input.focus()
      // Markdown 文件仅选中扩展名前的主名称。
      const extensionIndex = nodeType === 'file' ? value.search(/\.(?:md|markdown)$/i) : -1
      if (extensionIndex >= 0) input.setSelectionRange(0, extensionIndex)
      else input.select()
      onFocused()
    })
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [nodeType, onFocused, shouldFocus, value])

  return (
    <div
      className="flex h-7 w-full items-center gap-1.5 px-2 text-panel-foreground"
      style={{ paddingLeft: 10 + depth * 14 }}
    >
      {nodeType === 'directory' ? (
        isDirectoryExpanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      {nodeType === 'directory' ? (
        isDirectoryExpanded ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <FileText className="size-4 shrink-0 text-muted-foreground" />
      )}
      <Input
        ref={inputRef}
        value={value}
        aria-label={nodeType === 'file' ? '文件名' : '文件夹名称'}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (value.trim()) onCommit(value.trim())
          else onCancel()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (value.trim()) onCommit(value.trim())
            else onCancel()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        className="h-6 flex-1 rounded-sm bg-card px-1.5 py-0 text-[13px] shadow-none"
      />
    </div>
  )
}

/** 返回目录中尚未占用的默认名称。 */
function getAvailableName(defaultName: string, nodes: FileNode[]): string {
  // 已有名称集合用于在临时节点出现前确定编号。
  const existingNames = new Set(nodes.map((node) => node.name))
  if (!existingNames.has(defaultName)) return defaultName
  // 扩展名位置用于保证 Markdown 编号位于 .md 之前。
  const extensionIndex = defaultName.lastIndexOf('.')
  // 仅文件默认名包含需要保留的扩展名。
  const hasExtension = extensionIndex > 0
  // 默认名称主体承载递增编号。
  const stem = hasExtension ? defaultName.slice(0, extensionIndex) : defaultName
  // 文件扩展名在编号后保持不变。
  const extension = hasExtension ? defaultName.slice(extensionIndex) : ''
  // 编号从 1 开始匹配现有文件系统命名规则。
  let index = 1
  while (existingNames.has(`${stem} ${index}${extension}`)) index += 1
  return `${stem} ${index}${extension}`
}

/** Commits a file-tree create or rename operation. */
async function commitEditing(editing: EditingState, value: string): Promise<void> {
  if (!value) return
  try {
    if (editing.kind === 'create-file') {
      await window.api.file.create(editing.parent, value)
      await useEditorStore.getState().refreshDirectory(editing.parent)
    } else if (editing.kind === 'create-folder') {
      await window.api.file.createFolder(editing.parent, value)
      await useEditorStore.getState().refreshDirectory(editing.parent)
    } else {
      await window.api.file.rename(editing.path, value)
      await useEditorStore.getState().refreshDirectory(editing.parent)
    }
  } catch (error) {
    toast.error('操作失败', { description: String(error) })
  }
}
