import { useEffect, useRef } from 'react'

import type { OutlineItem } from '@/lib/outline'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

// Heading levels use a fixed visual hierarchy while deeper levels share the tertiary style.
const OUTLINE_LEVEL_STYLES: Record<number, string> = {
  1: 'h-8 font-semibold text-foreground',
  2: 'h-7 font-medium text-panel-foreground',
  3: 'h-7 text-muted-foreground'
}

/** Renders navigable headings for the active document. */
export function OutlinePanel({ items }: { items: OutlineItem[] }): React.JSX.Element {
  // Active heading follows the editor viewport.
  const activeHeading = useEditorStore((state) => state.activeHeading)
  // Heading navigation delegates scrolling to the editor store.
  const scrollToHeading = useEditorStore((state) => state.scrollToHeading)
  // Active item reference keeps the current heading visible in long outlines.
  const activeItemRef = useRef<HTMLButtonElement>(null)

  // Minimal nearest-edge scrolling avoids repositioning headings that are already visible.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeHeading])

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
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-2 left-3 w-px bg-border/80"
            />
            {items.map((item, index) => {
              // Capped level selects the shared style for H3 and deeper headings.
              const styleLevel = Math.min(item.level, 3)
              // Level style separates document hierarchy without adding extra decoration.
              const levelStyle = OUTLINE_LEVEL_STYLES[styleLevel]
              // Active state follows the heading nearest the editor viewport.
              const isActive = activeHeading === index

              return (
                <button
                  ref={isActive ? activeItemRef : null}
                  key={`${item.line}-${index}`}
                  type="button"
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => scrollToHeading(index)}
                  className={cn(
                    'relative flex w-full items-center rounded-md pr-2 text-left text-[13px] outline-none transition-colors before:absolute before:top-1/2 before:left-[11px] before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-transparent hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                    levelStyle,
                    isActive && 'text-foreground before:bg-primary'
                  )}
                  style={{ paddingLeft: 22 + (item.level - 1) * 14 }}
                  title={item.text}
                >
                  <span className="truncate">{item.text || '无标题'}</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
