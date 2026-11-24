import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { memo, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2
} from 'lucide-react'
import type { FileNode } from '../../../shared/contracts'
import {
  CREATE_DEFAULT_NAMES,
  getAvailableName,
  type EditingState
} from '@/components/file-tree-editing'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { dirname } from '@/lib/markdown-paths'
import { IS_MAC } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

export interface TreeNodeProps {
  node: FileNode
  parentPath: string
  depth: number
  expandedDirSet: ReadonlySet<string>
  treeNodes: Record<string, FileNode[]>
  editing: EditingState | null
  onEdit: (editing: EditingState | null) => void
  onEditingValueChange: (value: string) => void
  onCommitEdit: (value: string) => void
  onDeleteRequest: (node: FileNode) => void
}

export interface EditingRowProps {
  value: string
  depth: number
  nodeType: FileNode['type']
  mode: 'create' | 'rename'
  isDirectoryExpanded?: boolean
  shouldFocus: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
  onFocused: () => void
}

/** 渲染用于新建或重命名文件树条目的行内输入框，支持取消未修改的失焦新建。 */
export function EditingRow({
  value,
  depth,
  nodeType,
  mode,
  isDirectoryExpanded = false,
  shouldFocus,
  onChange,
  onCommit,
  onCancel,
  onFocused
}: EditingRowProps): React.JSX.Element {
  useTranslation()

  // 名称输入框引用用于在右键菜单完全关闭后获取焦点。
  const inputRef = useRef<HTMLInputElement>(null)
  // 记录首次进入编辑态时的默认文件名，用于判断用户是否未改动直接失焦取消。
  const initialValueRef = useRef(value)
  // 防止回车提交后失焦事件二次触发。
  const settledRef = useRef(false)

  useEffect(() => {
    if (!shouldFocus) return
    // 下一帧聚焦确保菜单焦点范围已经完成卸载。
    const animationFrameId = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const extensionIndex = nodeType === 'file' ? value.search(/\.(?:md|markdown)$/i) : -1
      if (extensionIndex >= 0) input.setSelectionRange(0, extensionIndex)
      else input.select()
      onFocused()
    })
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [nodeType, onFocused, shouldFocus, value])

  return (
    <div
      className="relative flex h-7 w-full items-center gap-1.5 rounded-md bg-card px-2 text-[13px] text-foreground shadow-xs ring-1 ring-inset ring-ring/75 transition-[box-shadow,background-color] focus-within:ring-ring"
      style={{ paddingLeft: 10 + depth * 14 }}
    >
      {nodeType === 'directory' ? (
        isDirectoryExpanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      {nodeType === 'directory' ? (
        isDirectoryExpanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : (
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        aria-label={nodeType === 'file' ? t('workspace.file-name') : t('workspace.folder-name')}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (settledRef.current) return
          const trimmed = value.trim()
          if (!trimmed) {
            onCancel()
            return
          }
          // 新建节点时若未改名直接失焦，视作误触取消而非写入空文件。
          if (mode === 'create' && trimmed === initialValueRef.current.trim()) {
            onCancel()
            return
          }
          settledRef.current = true
          onCommit(trimmed)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            const trimmed = value.trim()
            settledRef.current = true
            if (trimmed) onCommit(trimmed)
            else onCancel()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            settledRef.current = true
            onCancel()
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent p-0 text-[13px] text-foreground outline-none selection:bg-ring/20 selection:text-foreground placeholder:text-muted-foreground"
      />
    </div>
  )
}

/** 渲染可递归展开的文件树条目、未保存状态点及语义化右键菜单。 */
export const TreeNode = memo(function TreeNode({
  node,
  parentPath,
  depth,
  expandedDirSet,
  treeNodes,
  editing,
  onEdit,
  onEditingValueChange,
  onCommitEdit,
  onDeleteRequest
}: TreeNodeProps): React.JSX.Element {
  useTranslation()

  const openPath = useEditorStore((state) => state.openPath)
  const expandDirectory = useEditorStore((state) => state.expandDirectory)
  const collapseDirectory = useEditorStore((state) => state.collapseDirectory)
  const [shouldFocusEditing, setShouldFocusEditing] = useState(false)
  const isEditingFromMenuRef = useRef(false)

  const normalizedNodePath = node.path.replace(/\\/g, '/').toLowerCase()
  // 仅订阅当前节点是否为活动文档以及是否脏改的布尔值，避免编辑正文引起全树节点重渲染。
  const active = useEditorStore(
    (state) =>
      node.type === 'file' &&
      state.activeKey?.replace(/\\/g, '/').toLowerCase() === normalizedNodePath
  )
  const isDirty = useEditorStore((state) => {
    if (node.type !== 'file') return false
    const directDoc = state.openDocs[node.path]
    if (directDoc) return directDoc.rawMarkdown !== directDoc.savedRawMarkdown
    for (const key in state.openDocs) {
      const doc = state.openDocs[key]
      if (doc.diskPath?.replace(/\\/g, '/').toLowerCase() === normalizedNodePath) {
        return doc.rawMarkdown !== doc.savedRawMarkdown
      }
    }
    return false
  })
  const children = node.type === 'directory' ? treeNodes[node.path] ?? [] : []
  const isExpanded = node.type === 'directory' && expandedDirSet.has(node.path)
  const renameEditing = editing?.kind === 'rename' && editing.path === node.path ? editing : null
  const childEditing =
    editing && editing.kind !== 'rename' && editing.parent === node.path ? editing : null

  /** 打开当前文件或切换目录展开状态。 */
  const handleOpen = (): void => {
    if (node.type === 'file') void openPath(node.path)
    else if (isExpanded) collapseDirectory(node.path)
    else void expandDirectory(node.path)
  }

  /** 展开目标目录并插入带默认名称的新建输入行。 */
  const handleStartCreate = async (kind: 'create-file' | 'create-folder'): Promise<void> => {
    isEditingFromMenuRef.current = true
    setShouldFocusEditing(false)
    if (!isExpanded) await expandDirectory(node.path)
    const directoryNodes = useEditorStore.getState().treeNodes[node.path] ?? []
    const value = getAvailableName(t(CREATE_DEFAULT_NAMES[kind]), directoryNodes)
    onEdit({
      kind,
      parent: node.path,
      value,
      depth: depth + 1,
      openAfterCreate: kind === 'create-file'
    })
  }

  /** 响应树节点级的快捷键操作（重命名与删除）。 */
  const handleNodeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'F2') {
      event.preventDefault()
      event.stopPropagation()
      setShouldFocusEditing(true)
      onEdit({
        kind: 'rename',
        path: node.path,
        value: node.name,
        parent: dirname(node.path),
        depth,
        nodeType: node.type
      })
    } else if (event.key === 'Delete') {
      event.preventDefault()
      event.stopPropagation()
      onDeleteRequest(node)
    }
  }

  return (
    <div role="none">
      {renameEditing ? (
        <EditingRow
          value={renameEditing.value}
          depth={renameEditing.depth}
          nodeType={renameEditing.nodeType}
          mode="rename"
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
              type="button"
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={node.type === 'directory' ? isExpanded : undefined}
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              data-tree-path={node.path}
              data-parent-path={parentPath}
              data-node-type={node.type}
              data-expanded={isExpanded ? 'true' : 'false'}
              className={cn(
                // 菜单打开时保留目标节点高亮，明确右键上下文归属。
                'group relative flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-panel-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                active && 'bg-selected font-medium text-foreground hover:bg-selected'
              )}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={handleOpen}
              onKeyDown={handleNodeKeyDown}
              title={node.path}
            >
              {node.type === 'directory' ? (
                isExpanded ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              {node.type === 'directory' ? (
                isExpanded ? (
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <FileText
                  className={cn(
                    'size-3.5 shrink-0 text-muted-foreground',
                    active && 'text-foreground'
                  )}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {isDirty && (
                <span
                  aria-label={t('workspace.unsaved')}
                  className="mr-0.5 size-1.5 shrink-0 rounded-full bg-info"
                />
              )}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent
            className="min-w-48 w-max"
            onCloseAutoFocus={(event) => {
              if (!isEditingFromMenuRef.current) return
              event.preventDefault()
              isEditingFromMenuRef.current = false
              setShouldFocusEditing(true)
            }}
          >
            {node.type === 'file' ? (
              <ContextMenuItem onSelect={handleOpen}>
                <FileText />
                {t('workspace.open')}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={handleOpen}>
                {isExpanded ? <ChevronDown /> : <ChevronRight />}
                {isExpanded ? t('workspace.collapse') : t('workspace.expand')}
              </ContextMenuItem>
            )}
            {node.type === 'directory' && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void handleStartCreate('create-file')}>
                  <FilePlus />
                  {t('workspace.new-markdown-file')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void handleStartCreate('create-folder')}>
                  <FolderPlus />
                  {t('workspace.new-folder')}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
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
              <Pencil />
              {t('workspace.rename')}
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void window.api.file.reveal(node.path)}>
              <ExternalLink />
              {t('workspace.show-in-file-manager')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onDeleteRequest(node)}>
              <Trash2 />
              {t('workspace.delete')}
              <ContextMenuShortcut>{IS_MAC ? '⌫' : 'Del'}</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {isExpanded && (
        <div role="group" className="relative mt-0.5 space-y-0.5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-border/80"
            style={{ left: 17 + depth * 14 }}
          />
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              parentPath={node.path}
              depth={depth + 1}
              expandedDirSet={expandedDirSet}
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
              mode="create"
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
})
