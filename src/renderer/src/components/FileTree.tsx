import { useState } from 'react'
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
  | { kind: 'rename'; path: string; value: string; parent: string }
  | { kind: 'create-file'; parent: string; value: string }
  | { kind: 'create-folder'; parent: string; value: string }

/** Renders the active workspace as an editable Markdown file tree. */
export function FileTree(): React.JSX.Element {
  // Workspace root labels the panel and scopes root nodes.
  const workspaceRoot = useEditorStore((state) => state.workspaceRoot)
  // Tree nodes provide directory children by absolute path.
  const treeNodes = useEditorStore((state) => state.treeNodes)
  // Expanded directories control visible tree branches.
  const expandedDirs = useEditorStore((state) => state.expandedDirs)
  // Root-level editing state renders new entries beside root nodes.
  const [editing, setEditing] = useState<EditingState | null>(null)

  if (!workspaceRoot) return <div className="p-4 text-sm text-muted-foreground">未打开文件夹</div>

  // Workspace name keeps the panel label concise while the title preserves the full path.
  const workspaceName = basename(workspaceRoot) || workspaceRoot
  // Root nodes populate the first visible tree level.
  const rootNodes = treeNodes[workspaceRoot] ?? []

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs font-semibold text-panel-foreground"
        title={workspaceRoot}
      >
        <FolderOpen className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">{workspaceName}</span>
      </div>
      <div className="flex-1 overflow-auto py-1.5">
        {rootNodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无 Markdown 文件</div>
        ) : (
          rootNodes.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirs}
              treeNodes={treeNodes}
              onStartEdit={setEditing}
            />
          ))
        )}
        {editing?.parent === workspaceRoot && (
          <EditingRow
            value={editing.value}
            onChange={(value) => setEditing({ ...editing, value })}
            onCancel={() => setEditing(null)}
            onCommit={(value) => {
              void commitEditing(editing, value).finally(() => setEditing(null))
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Renders one recursive file or directory row. */
function TreeNode({
  node,
  depth,
  expandedDirs,
  treeNodes,
  onStartEdit
}: {
  node: FileNode
  depth: number
  expandedDirs: string[]
  treeNodes: Record<string, FileNode[]>
  onStartEdit: (editing: EditingState) => void
}): React.JSX.Element {
  // File action opens the selected Markdown document.
  const openPath = useEditorStore((state) => state.openPath)
  // Expand action loads and reveals a directory branch.
  const expandDirectory = useEditorStore((state) => state.expandDirectory)
  // Collapse action hides a directory branch.
  const collapseDirectory = useEditorStore((state) => state.collapseDirectory)
  // Active key identifies the selected file row.
  const activeKey = useEditorStore((state) => state.activeKey)
  // Branch-local editing state renders entries inside this directory.
  const [editing, setEditing] = useState<EditingState | null>(null)

  // Active state highlights the currently edited file.
  const active = node.type === 'file' && node.path === activeKey
  // Directory children render below expanded branches.
  const children = node.type === 'directory' ? treeNodes[node.path] ?? [] : []
  // Expanded state selects the directory affordance and children.
  const isExpanded = node.type === 'directory' && expandedDirs.includes(node.path)

  /** Opens a file or toggles the current directory. */
  const handleOpen = (): void => {
    if (node.type === 'file') void openPath(node.path)
    else if (isExpanded) collapseDirectory(node.path)
    else void expandDirectory(node.path)
  }

  /** Refreshes one directory after a filesystem mutation. */
  const refreshDirectory = async (directory: string): Promise<void> => {
    await useEditorStore.getState().refreshDirectory(directory)
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className={cn(
              'group relative flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-panel-foreground outline-none transition-colors before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
              active && 'bg-selected/70 font-medium text-foreground before:bg-primary'
            )}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={handleOpen}
            onDoubleClick={node.type === 'file' ? handleOpen : undefined}
            title={node.path}
          >
            {node.type === 'directory' ? (
              isExpanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />
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
        <ContextMenuContent className="w-44">
          {node.type === 'file' ? (
            <ContextMenuItem onSelect={handleOpen}>打开</ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={handleOpen}>{isExpanded ? '折叠' : '展开'}</ContextMenuItem>
          )}
          {node.type === 'directory' && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => setEditing({ kind: 'create-file', parent: node.path, value: '' })}
              >
                <FilePlus /> 新建 Markdown
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => setEditing({ kind: 'create-folder', parent: node.path, value: '' })}
              >
                <FolderPlus /> 新建文件夹
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => onStartEdit({ kind: 'rename', path: node.path, value: node.name, parent: dirname(node.path) })}
          >
            <Pencil /> 重命名
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void window.api.file.trash(node.path).then(async () => {
                await refreshDirectory(dirname(node.path))
                toast.success('已移至回收站')
              })
            }}
          >
            <Trash2 /> 删除
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void window.api.file.reveal(node.path)}>
            <ExternalLink /> 在资源管理器中显示
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

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
              onStartEdit={onStartEdit}
            />
          ))}
          {editing && (
            <EditingRow
              value={editing.value}
              onChange={(value) => setEditing({ ...editing, value })}
              onCancel={() => setEditing(null)}
              onCommit={(value) => {
                void commitEditing(editing, value).finally(() => setEditing(null))
              }}
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
  onChange,
  onCommit,
  onCancel
}: {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="px-3 py-1">
      <Input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (value.trim()) onCommit(value.trim())
          else onCancel()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit(value.trim())
          if (event.key === 'Escape') onCancel()
        }}
        className="h-7 rounded-md bg-card text-sm"
      />
    </div>
  )
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
