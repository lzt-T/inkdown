import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { FilePlus, FileText, FolderOpen, X } from 'lucide-react'
import inkdownLogo from '@/assets/inkdown-logo.png'
import { Button } from '@/components/ui/button'
import { formatShortcut } from '@/lib/platform'
import { useEditorStore } from '@/store/editor-store'

interface RecentPath {
  name: string
  parent: string
}

interface RecentGroupProps {
  title: string
  items: string[]
  icon: typeof FileText
  onOpen: (path: string) => void
  onRemove: (path: string) => void
}

interface WelcomeProps {
  onNewFile: () => void
}

// 每组最近记录保持紧凑，避免启动页堆砌过长列表。
const RECENT_ITEM_LIMIT = 5

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

/** 渲染单组最近文件或最近工作区，支持单行快捷移除。 */
function RecentGroup({
  title,
  items,
  icon: Icon,
  onOpen,
  onRemove
}: RecentGroupProps): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-0.5">
        {items.slice(0, RECENT_ITEM_LIMIT).map((path) => {
          const recentPath = getRecentPath(path)
          return (
            <div
              key={path}
              className="group relative flex items-center rounded-md transition-colors hover:bg-accent/70 focus-within:bg-accent/70"
            >
              <button
                type="button"
                title={path}
                onClick={() => onOpen(path)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                <span className="truncate text-sm font-medium text-foreground">
                  {recentPath.name}
                </span>
                {recentPath.parent && (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {recentPath.parent}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={t('workspace.remove-recent-entry', { name: recentPath.name })}
                title={t('workspace.remove-from-recent')}
                onClick={() => onRemove(path)}
                className="absolute right-1.5 flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition-[opacity,background-color,color] hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 渲染克制现代工作台风格的启动欢迎页与最近访问入口。 */
export function Welcome({ onNewFile }: WelcomeProps): React.JSX.Element {
  useTranslation()

  const recent = useEditorStore((state) => state.recent)
  const openWorkspace = useEditorStore((state) => state.openWorkspace)
  const openWorkspacePath = useEditorStore((state) => state.openWorkspacePath)
  const openFileDialog = useEditorStore((state) => state.openFileDialog)
  const openPath = useEditorStore((state) => state.openPath)
  const removeRecentEntry = useEditorStore((state) => state.removeRecentEntry)

  const hasRecentItems = recent.files.length > 0 || recent.workspaces.length > 0

  return (
    <div className="flex h-full overflow-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-8 py-12">
        <section>
          <div className="flex items-center gap-3.5">
            <img
              src={inkdownLogo}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="size-11 shrink-0 select-none"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Inkdown</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('workspace.a-local-first-markdown-editor-inspired-by-typora')}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button size="default" className="gap-2.5 active:translate-y-px" onClick={onNewFile}>
              <FilePlus />
              <span>{t('workspace.new-file')}</span>
              <kbd className="rounded bg-primary-foreground/15 px-1.5 py-0.5 font-sans text-[11px] font-medium text-primary-foreground/90">
                {formatShortcut(['N'])}
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="default"
              className="gap-2.5 bg-card active:translate-y-px"
              onClick={() => void openFileDialog()}
            >
              <FileText />
              <span>{t('workspace.open-file')}</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
                {formatShortcut(['O'])}
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="default"
              className="gap-2.5 bg-card active:translate-y-px"
              onClick={() => void openWorkspace()}
            >
              <FolderOpen />
              <span>{t('workspace.open-folder')}</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
                {formatShortcut(['Shift', 'O'])}
              </kbd>
            </Button>
          </div>
        </section>

        <section className="mt-10 border-t pt-6">
          {hasRecentItems ? (
            <div className="space-y-5">
              <div className="flex items-baseline justify-between px-2.5">
                <h2 className="text-xs font-semibold text-foreground">{t('workspace.recent')}</h2>
                <span className="text-xs text-muted-foreground">
                  {t('workspace.continue-where-you-left-off')}
                </span>
              </div>
              {recent.files.length > 0 && (
                <RecentGroup
                  title={t('workspace.files')}
                  items={recent.files}
                  icon={FileText}
                  onOpen={(path) => void openPath(path)}
                  onRemove={(path) => void removeRecentEntry('file', path)}
                />
              )}
              {recent.workspaces.length > 0 && (
                <RecentGroup
                  title={t('workspace.folders')}
                  items={recent.workspaces}
                  icon={FolderOpen}
                  onOpen={(path) => void openWorkspacePath(path)}
                  onRemove={(path) => void removeRecentEntry('workspace', path)}
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('workspace.files-and-folders-you-open-will-appear-here')}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
