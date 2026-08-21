import type { OutlineItem } from '@/lib/outline'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

/** Renders navigable headings for the active document. */
export function OutlinePanel({ items }: { items: OutlineItem[] }): React.JSX.Element {
  // Active heading follows the editor viewport.
  const activeHeading = useEditorStore((state) => state.activeHeading)
  // Heading navigation delegates scrolling to the editor store.
  const scrollToHeading = useEditorStore((state) => state.scrollToHeading)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center border-b px-3 text-[11px] font-semibold text-muted-foreground">
        大纲
      </div>
      <div className="flex-1 overflow-auto py-1.5">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无标题</div>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.line}-${index}`}
              onClick={() => scrollToHeading(index)}
              className={cn(
                'flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-panel-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                activeHeading === index && 'bg-selected font-medium text-foreground'
              )}
              style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
              title={item.text}
            >
              <span className="truncate">{item.text || '无标题'}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
