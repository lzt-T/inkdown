import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

interface TabsBarProps {
  onRequestClose: (key: string) => void
}

// 按编辑模式匹配对应的激活标签背景色，使标签与正文画布无色差衔接。
const ACTIVE_TAB_BACKGROUND = {
  wysiwyg: 'bg-white dark:bg-[#111113]',
  source: 'bg-background'
} as const

/** 仅在打开多篇文档时展示紧凑工作台标签栏，支持中键关闭与方向键切换。 */
export function TabsBar({ onRequestClose }: TabsBarProps): React.JSX.Element | null {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Open documents provide tab labels and dirty state.
  const openDocs = useEditorStore((state) => state.openDocs)
  // Tab order preserves the user's document sequence.
  const tabOrder = useEditorStore((state) => state.tabOrder)
  // Active key selects the current document tab.
  const activeKey = useEditorStore((state) => state.activeKey)
  // 编辑模式决定当前激活标签需要贴合的正文表面色。
  const mode = useEditorStore((state) => state.mode)
  // Tab activation switches the editor document.
  const activateTab = useEditorStore((state) => state.activateTab)
  // 引用映射用于左右方向键切换时同步焦点。
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // 单文档或无文档时隐藏标签栏，释放纵向写作空间。
  if (tabOrder.length <= 1) return null

  /** 支持在标签栏内通过左右方向键切换已打开文档。 */
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabOrder.length) % tabOrder.length
    const nextKey = tabOrder[nextIndex]
    if (!nextKey) return
    activateTab(nextKey)
    tabRefs.current[nextKey]?.focus()
  }

  return (
    <div className="relative flex h-9 shrink-0 items-end bg-panel px-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
      <div
        role="tablist"
        aria-label={t('workspace.open-documents')}
        className="inkdown-tabs-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden"
      >
        {tabOrder.map((key, index) => {
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
              className="group relative flex h-8 min-w-28 max-w-52 shrink-0 items-center"
            >
              <button
                ref={(element) => {
                  tabRefs.current[key] = element
                }}
                type="button"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                onClick={() => activateTab(key)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  onRequestClose(key)
                }}
                className={cn(
                  'relative flex h-full min-w-0 flex-1 items-center gap-2 px-3 pr-8 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                  isActive
                    ? cn(
                        'z-10 rounded-t-md border border-b-0 border-border font-medium text-foreground',
                        ACTIVE_TAB_BACKGROUND[mode]
                      )
                    : 'rounded-md text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                )}
                title={doc.diskPath ?? doc.name}
              >
                <span className="truncate">{doc.name}</span>
                {isDirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-info" aria-hidden="true" />
                )}
                {isDirty && <span className="sr-only">{t('workspace.unsaved')}</span>}
              </button>
              <button
                type="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={t('workspace.close-value', { v0: doc.name })}
                title={t('workspace.close-value', { v0: doc.name })}
                className={cn(
                  'absolute right-1 z-20 flex size-5.5 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition-[color,background-color,opacity] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100',
                  isActive && 'opacity-100'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  onRequestClose(key)
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
