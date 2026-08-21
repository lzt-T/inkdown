import { FilePlus, FileText, FolderOpen, History } from 'lucide-react'
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
      <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground">{title}</h3>
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
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-accent"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-primary">
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
    <div
      className="@container relative flex h-full overflow-auto bg-background"
      style={{
        backgroundImage:
          'radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 34%), radial-gradient(circle at 82% 76%, color-mix(in srgb, var(--primary) 5%, transparent), transparent 30%)'
      }}
    >
      <div className="relative mx-auto grid w-full max-w-5xl content-center gap-10 px-6 py-12 @min-[48rem]:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] @min-[48rem]:items-center @min-[48rem]:px-10">
        <section className="max-w-xl">
          <div className="mb-7 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_color-mix(in_srgb,var(--primary)_70%,transparent)]">
            <FileText className="size-5" />
          </div>

          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-foreground">Inkdown</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            一个本地优先的 Typora 风格 Markdown 编辑器。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="sm" className="active:translate-y-px" onClick={newUntitled}>
              <FilePlus /> 新建文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="active:translate-y-px"
              onClick={() => void openFileDialog()}
            >
              <FileText /> 打开文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="active:translate-y-px"
              onClick={() => void openWorkspace()}
            >
              <FolderOpen /> 打开文件夹
            </Button>
          </div>
        </section>

        <aside className="rounded-xl border bg-card/85 p-3">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">最近使用</h2>
              <p className="mt-1 text-xs text-muted-foreground">继续上一次的写作</p>
            </div>
            <History className="size-4 text-muted-foreground" />
          </div>

          {hasRecentItems ? (
            <div className="space-y-5 border-t pt-3">
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
            <div className="flex min-h-44 flex-col items-center justify-center border-t px-6 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <History className="size-4" />
              </span>
              <p className="text-sm font-medium text-card-foreground">暂无最近内容</p>
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
