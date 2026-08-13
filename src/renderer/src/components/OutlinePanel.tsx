import { useEditorStore } from '../store/editor-store'
import type { OutlineItem } from '../lib/outline'
import { cn } from '../lib/utils'

export function OutlinePanel({ items }: { items: OutlineItem[] }): React.JSX.Element {
  const activeHeading = useEditorStore((state) => state.activeHeading)
  const scrollToHeading = useEditorStore((state) => state.scrollToHeading)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">大纲</div>
      <div className="flex-1 overflow-auto py-1">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无标题</div>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.line}-${index}`}
              onClick={() => scrollToHeading(index)}
              className={cn(
                'flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                activeHeading === index && 'bg-accent text-accent-foreground'
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
