import { useState } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../store/editor-store'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { cn } from '../lib/utils'

export function TabsBar(): React.JSX.Element | null {
  const openDocs = useEditorStore((state) => state.openDocs)
  const tabOrder = useEditorStore((state) => state.tabOrder)
  const activeKey = useEditorStore((state) => state.activeKey)
  const activateTab = useEditorStore((state) => state.activateTab)
  const closeTab = useEditorStore((state) => state.closeTab)
  const [pendingClose, setPendingClose] = useState<string | null>(null)

  if (tabOrder.length === 0) return null

  const pendingDoc = pendingClose ? openDocs[pendingClose] : null

  const requestClose = (key: string): void => {
    const doc = openDocs[key]
    if (!doc) return
    if (doc.rawMarkdown !== doc.savedRawMarkdown) setPendingClose(key)
    else closeTab(key)
  }

  return (
    <>
      <div className="flex h-9 shrink-0 items-end gap-1 border-b bg-muted/40 px-2">
        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabOrder.map((key) => {
            const doc = openDocs[key]
            if (!doc) return null
            const active = key === activeKey
            const dirty = doc.rawMarkdown !== doc.savedRawMarkdown
            return (
              <button
                key={key}
                onClick={() => activateTab(key)}
                className={cn(
                  'group flex h-8 min-w-0 max-w-44 items-center gap-2 rounded-t-md border border-b-0 px-3 text-xs',
                  active
                    ? 'bg-card text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent/60'
                )}
                title={doc.diskPath ?? doc.name}
              >
                <span className="truncate">{doc.name}</span>
                {dirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-auto hidden rounded hover:bg-muted group-hover:block"
                  onClick={(event) => {
                    event.stopPropagation()
                    requestClose(key)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') requestClose(key)
                  }}
                >
                  <X className="size-3.5" />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <AlertDialog open={Boolean(pendingDoc)} onOpenChange={(open) => !open && setPendingClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>关闭未保存的文档？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDoc?.name ?? '当前文档'} 有未保存的更改，关闭后将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">取消</AlertDialogCancel>
            <AlertDialogAction variant="default" size="default"
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

