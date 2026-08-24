import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { buildOutlineTree, type OutlineItem, type OutlineTreeNode } from '@/lib/outline'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

interface OutlinePanelProps {
  documentKey: string | null
  items: OutlineItem[]
}

interface OutlineTreeItemProps {
  node: OutlineTreeNode
  depth: number
  activeHeading: number
  collapsedNodeIndexes: ReadonlySet<number>
  activeItemRef: React.RefObject<HTMLButtonElement | null>
  onToggle: (index: number) => void
  onSelect: (index: number) => void
}

// Empty collapse state avoids allocating a Set when no document is active.
const EMPTY_COLLAPSED_NODE_INDEXES = new Set<number>()

/** Renders one heading and its currently expanded descendants. */
function OutlineTreeItem({
  node,
  depth,
  activeHeading,
  collapsedNodeIndexes,
  activeItemRef,
  onToggle,
  onSelect
}: OutlineTreeItemProps): React.JSX.Element {
  // Child presence controls whether a disclosure button is shown.
  const hasChildren = node.children.length > 0
  // Per-document collapse state controls descendant visibility.
  const isCollapsed = collapsedNodeIndexes.has(node.index)
  // Active state follows the heading nearest the editor viewport.
  const isActive = activeHeading === node.index

  return (
    <li>
      <div className="flex h-7 min-w-0 items-center pr-2" style={{ paddingLeft: 6 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
            aria-label={`${isCollapsed ? '展开' : '收起'} ${node.text || '无标题'}`}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? '展开子标题' : '收起子标题'}
            onClick={() => onToggle(node.index)}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <button
          ref={isActive ? activeItemRef : null}
          type="button"
          aria-current={isActive ? 'location' : undefined}
          onClick={() => onSelect(node.index)}
          className={cn(
            'relative flex h-full min-w-0 flex-1 items-center rounded-sm px-1.5 text-left text-[13px] text-muted-foreground outline-none transition-colors before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
            depth === 0 && 'font-medium text-panel-foreground',
            isActive && 'bg-selected text-foreground before:bg-primary'
          )}
          title={node.text}
        >
          <span className="truncate">{node.text || '无标题'}</span>
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="m-0 list-none p-0">
          {node.children.map((child) => (
            <OutlineTreeItem
              key={`${child.line}-${child.index}`}
              node={child}
              depth={depth + 1}
              activeHeading={activeHeading}
              collapsedNodeIndexes={collapsedNodeIndexes}
              activeItemRef={activeItemRef}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Renders a collapsible heading tree for the active document. */
export function OutlinePanel({ documentKey, items }: OutlinePanelProps): React.JSX.Element {
  // Active heading follows the editor viewport.
  const activeHeading = useEditorStore((state) => state.activeHeading)
  // Direct selection updates the clicked heading before editor navigation begins.
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  // Heading navigation delegates scrolling to the editor store.
  const scrollToHeading = useEditorStore((state) => state.scrollToHeading)
  // Open document keys bound the lifetime of session-only collapse state.
  const openDocumentKeys = useEditorStore((state) => state.tabOrder)
  // Active item reference keeps the current visible heading in view.
  const activeItemRef = useRef<HTMLButtonElement>(null)
  // Collapse sets remain isolated per open document.
  const [collapsedIndexesByDocument, setCollapsedIndexesByDocument] = useState<
    Record<string, Set<number>>
  >({})
  // Tree structure is derived from the filtered flat outline.
  const tree = useMemo(() => buildOutlineTree(items), [items])
  // Current document collapse state defaults to fully expanded.
  const collapsedNodeIndexes = documentKey
    ? (collapsedIndexesByDocument[documentKey] ?? EMPTY_COLLAPSED_NODE_INDEXES)
    : EMPTY_COLLAPSED_NODE_INDEXES

  /** Toggles one branch without changing the selected heading. */
  const toggleNode = (index: number): void => {
    if (!documentKey) return
    setCollapsedIndexesByDocument((current) => {
      // New Set keeps React state updates immutable.
      const nextIndexes = new Set(current[documentKey] ?? EMPTY_COLLAPSED_NODE_INDEXES)
      if (nextIndexes.has(index)) nextIndexes.delete(index)
      else nextIndexes.add(index)
      return { ...current, [documentKey]: nextIndexes }
    })
  }

  /** Selects a heading immediately before requesting editor navigation. */
  const selectHeading = (index: number): void => {
    setActiveHeading(index)
    scrollToHeading(index)
  }

  // Minimal nearest-edge scrolling avoids repositioning visible headings.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeHeading])

  // Closing a document releases its session-only collapse state.
  useEffect(() => {
    setCollapsedIndexesByDocument((current) => {
      // Active tab order is the source of truth for retained document state.
      const openKeySet = new Set(openDocumentKeys)
      // Remaining entries belong only to currently open documents.
      const entries = Object.entries(current).filter(([key]) => openKeySet.has(key))
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries)
    })
  }, [openDocumentKeys])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs font-semibold text-panel-foreground">
        <span>大纲</span>
        <span className="font-normal tabular-nums text-muted-foreground">{items.length} 项</span>
      </div>
      <div className="relative flex-1 overflow-auto py-2">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无标题</div>
        ) : (
          <ul aria-label="文档大纲" className="m-0 list-none p-0">
            {tree.map((node) => (
              <OutlineTreeItem
                key={`${node.line}-${node.index}`}
                node={node}
                depth={0}
                activeHeading={activeHeading}
                collapsedNodeIndexes={collapsedNodeIndexes}
                activeItemRef={activeItemRef}
                onToggle={toggleNode}
                onSelect={selectHeading}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
