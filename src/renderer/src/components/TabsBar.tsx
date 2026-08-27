import { useState } from 'react'
import { X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

// 当前标签背景与对应编辑模式的正文表面保持一致。
const ACTIVE_TAB_BACKGROUND = {
  wysiwyg: 'bg-card',
  source: 'bg-background'
} as const

/** Renders open documents as a compact editorial tab index. */
export function TabsBar(): React.JSX.Element | null {
  // Open documents provide tab labels and dirty state.
  const openDocs = useEditorStore((state) => state.openDocs)
  // Tab order preserves the user's document sequence.
  const tabOrder = useEditorStore((state) => state.tabOrder)
  // Active key selects the current document tab.
  const activeKey = useEditorStore((state) => state.activeKey)
  // 编辑模式决定当前标签使用的正文背景。
  const mode = useEditorStore((state) => state.mode)
  // Tab activation switches the editor document.
  const activateTab = useEditorStore((state) => state.activateTab)
  // Close action removes a document after confirmation when needed.
  const closeTab = useEditorStore((state) => state.closeTab)
  // Pending close stores the dirty document awaiting confirmation.
  const [pendingClose, setPendingClose] = useState<string | null>(null)

  if (tabOrder.length === 0) return null

  // Pending document supplies confirmation dialog copy.
  const pendingDoc = pendingClose ? openDocs[pendingClose] : null

  /** Closes a clean tab or requests confirmation for a dirty tab. */
  const requestClose = (key: string): void => {
    // Requested document determines whether confirmation is required.
    const doc = openDocs[key]
    if (!doc) return
    if (doc.rawMarkdown !== doc.savedRawMarkdown) setPendingClose(key)
    else closeTab(key)
  }

  return (
    <>
      <div className="relative flex h-9 shrink-0 items-end bg-panel px-1.5 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
        <div
          role="tablist"
          aria-label="打开的文档"
          className="inkdown-tabs-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden"
        >
          {tabOrder.map((key) => {
            // Document data populates one tab.
            const doc = openDocs[key]
            if (!doc) return null
            // Active state connects the selected tab to the editor surface.
            const isActive = key === activeKey
            // Dirty state indicates unsaved document changes.
            const isDirty = doc.rawMarkdown !== doc.savedRawMarkdown
            return (
              <div
                key={key}
                className="group relative flex h-8 min-w-28 max-w-48 shrink-0 items-center"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => activateTab(key)}
                  className={cn(
                    'relative flex h-full min-w-0 flex-1 items-center gap-2 px-3 pr-8 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                    isActive
                      ? cn(
                          'z-10 rounded-t-lg border border-b-0 border-border font-medium text-foreground',
                          ACTIVE_TAB_BACKGROUND[mode]
                        )
                      : 'rounded-md text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                  )}
                  title={doc.diskPath ?? doc.name}
                >
                  <span className="truncate">{doc.name}</span>
                  {isDirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                </button>
                <button
                  type="button"
                  aria-label={`关闭 ${doc.name}`}
                  title={`关闭 ${doc.name}`}
                  className={cn(
                    'absolute right-1 z-20 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-[color,background-color,opacity] hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100',
                    isActive && 'opacity-100'
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    requestClose(key)
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <AlertDialog
        open={Boolean(pendingDoc)}
        onOpenChange={(open) => !open && setPendingClose(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>关闭未保存的文档？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDoc?.name ?? '当前文档'} 有未保存的更改，关闭后将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              size="default"
              onClick={() => {
                if (pendingClose) closeTab(pendingClose)
                setPendingClose(null)
              }}
            >
              关闭文档
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
