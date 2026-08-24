import { FilePlus, FileText, FolderOpen, History } from 'lucide-react'
import inkdownLogo from '@/assets/inkdown-logo.png'
import { useEditorStore } from '@/store/editor-store'
import { Button } from '@/components/ui/button'

interface RecentPath {
  name: string
  parent: string
}

interface RecentGroupProps {
  title: string
  items: string[]
  icon: typeof FileText
  onOpen: (path: string) => void
}

// Maximum number of entries shown in each recent group.
const RECENT_ITEM_LIMIT = 6

/** Splits a platform path without normalizing away its original separators. */
function getRecentPath(path: string): RecentPath {
  // Locate the final separator for both Windows and POSIX paths.
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))

  if (separatorIndex < 0) {
    return { name: path, parent: '' }
  }

  return {
    name: path.slice(separatorIndex + 1),
    parent: path.slice(0, separatorIndex)
  }
}

/** Renders one group of recent files or workspaces. */
function RecentGroup({ title, items, icon: Icon, onOpen }: RecentGroupProps): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {items.slice(0, RECENT_ITEM_LIMIT).map((path) => {
          // Derive a compact label while retaining the full path for hover disclosure.
          const recentPath = getRecentPath(path)

          return (
            <button
              key={path}
              type="button"
              title={path}
              onClick={() => onOpen(path)}
              className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-px active:bg-selected"
            >
              <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover:text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {recentPath.name}
                </span>
                {recentPath.parent && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {recentPath.parent}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Presents the editor entry actions and recent local documents. */
export function Welcome(): React.JSX.Element {
  // Recent paths populate the workspace continuation panel.
  const recent = useEditorStore((state) => state.recent)
  // Workspace actions remain delegated to the editor store.
  const openWorkspace = useEditorStore((state) => state.openWorkspace)
  // Direct workspace opening powers recent workspace entries.
  const openWorkspacePath = useEditorStore((state) => state.openWorkspacePath)
  // File picker action opens an existing Markdown document.
  const openFileDialog = useEditorStore((state) => state.openFileDialog)
  // Direct file opening powers recent file entries.
  const openPath = useEditorStore((state) => state.openPath)
  // Untitled document creation remains the primary action.
  const newUntitled = useEditorStore((state) => state.newUntitled)
  // The recent panel stays visible as a useful empty state for first-time users.
  const hasRecentItems = recent.files.length > 0 || recent.workspaces.length > 0

  return (
    <div className="@container relative flex h-full overflow-auto bg-background">
      <div className="relative mx-auto grid min-h-full w-full max-w-6xl content-start gap-12 px-8 py-12 @min-[52rem]:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] @min-[52rem]:content-center @min-[52rem]:items-center @min-[52rem]:px-12">
        <section className="max-w-xl">
          <img
            src={inkdownLogo}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="mb-8 size-16 select-none"
          />

          <h1 className="text-5xl font-semibold tracking-[-0.03em] text-foreground">Inkdown</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            一个本地优先的 Typora 风格 Markdown 编辑器。
          </p>

          <div className="mt-9 flex flex-wrap gap-2">
            <Button size="sm" className="rounded-md active:translate-y-px" onClick={newUntitled}>
              <FilePlus /> 新建文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md bg-card active:translate-y-px"
              onClick={() => void openFileDialog()}
            >
              <FileText /> 打开文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md bg-card active:translate-y-px"
              onClick={() => void openWorkspace()}
            >
              <FolderOpen /> 打开文件夹
            </Button>
          </div>
        </section>

        <aside className="border-t pt-7 @min-[52rem]:border-l @min-[52rem]:border-t-0 @min-[52rem]:pl-9 @min-[52rem]:pt-0">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">最近使用</h2>
              <p className="mt-1 text-xs text-muted-foreground">继续上一次的写作</p>
            </div>
            <History className="mt-0.5 size-4 text-primary" />
          </div>

          {hasRecentItems ? (
            <div className="space-y-6 pt-5">
              {recent.files.length > 0 && (
                <RecentGroup
                  title="文件"
                  items={recent.files}
                  icon={FileText}
                  onOpen={(path) => void openPath(path)}
                />
              )}
              {recent.workspaces.length > 0 && (
                <RecentGroup
                  title="文件夹"
                  items={recent.workspaces}
                  icon={FolderOpen}
                  onOpen={(path) => void openWorkspacePath(path)}
                />
              )}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-start justify-center py-6 text-left">
              <History className="mb-4 size-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">暂无最近内容</p>
              <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
                打开过的文件和文件夹会显示在这里。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
