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
import { useEditorStore } from '../store/editor-store'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './ui/context-menu'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import { dirname } from '../lib/markdown-paths'

type EditingState =
  | { kind: 'rename'; path: string; value: string; parent: string }
  | { kind: 'create-file'; parent: string; value: string }
  | { kind: 'create-folder'; parent: string; value: string }

export function FileTree(): React.JSX.Element {
  const workspaceRoot = useEditorStore((state) => state.workspaceRoot)
  const treeNodes = useEditorStore((state) => state.treeNodes)
  const expandedDirs = useEditorStore((state) => state.expandedDirs)
  const [editing, setEditing] = useState<EditingState | null>(null)

  if (!workspaceRoot) return <div className="p-4 text-sm text-muted-foreground">未打开文件夹</div>

  const rootNodes = treeNodes[workspaceRoot] ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="truncate border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {workspaceRoot}
      </div>
      <div className="flex-1 overflow-auto py-1">
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
  const openPath = useEditorStore((state) => state.openPath)
  const expandDirectory = useEditorStore((state) => state.expandDirectory)
  const collapseDirectory = useEditorStore((state) => state.collapseDirectory)
  const activeKey = useEditorStore((state) => state.activeKey)
  const [editing, setEditing] = useState<EditingState | null>(null)

  const active = node.type === 'file' && node.path === activeKey
  const children = node.type === 'directory' ? treeNodes[node.path] ?? [] : []
  const isExpanded = node.type === 'directory' && expandedDirs.includes(node.path)

  const handleOpen = (): void => {
    if (node.type === 'file') void openPath(node.path)
    else if (isExpanded) collapseDirectory(node.path)
    else void expandDirectory(node.path)
  }

  const refreshDirectory = async (directory: string): Promise<void> => {
    await useEditorStore.getState().refreshDirectory(directory)
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className={cn(
              'group flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground',
              active && 'bg-accent text-accent-foreground'
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
              isExpanded ? <FolderOpen className="size-4 shrink-0 text-primary" /> : <Folder className="size-4 shrink-0" />
            ) : (
              <FileText className="size-4 shrink-0" />
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
        <div>
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
        className="h-7 text-sm"
      />
    </div>
  )
}

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
