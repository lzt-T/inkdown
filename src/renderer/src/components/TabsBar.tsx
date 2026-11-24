import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { memo, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import type { EditorMode } from '../../../shared/contracts'

interface TabsBarProps {
  onRequestClose: (key: string) => void
}

// 按编辑模式匹配对应的激活标签背景色，使标签与正文画布无色差衔接。
const ACTIVE_TAB_BACKGROUND = {
  wysiwyg: 'bg-white dark:bg-[#111113]',
  source: 'bg-background'
} as const

interface TabItemProps {
  tabKey: string
  index: number
  isActive: boolean
  mode: EditorMode
  onActivate: (key: string) => void
  onRequestClose: (key: string) => void
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void
  registerTabRef: (key: string, element: HTMLButtonElement | null) => void
}

/** 独立订阅单个标签的元信息与脏状态，避免正文输入引起其他标签重渲染。 */
const TabItem = memo(function TabItem({
  tabKey,
  index,
  isActive,
  mode,
  onActivate,
  onRequestClose,
  onTabKeyDown,
  registerTabRef
}: TabItemProps): React.JSX.Element | null {
  useTranslation()

  const name = useEditorStore((state) => state.openDocs[tabKey]?.name ?? null)
  const diskPath = useEditorStore((state) => state.openDocs[tabKey]?.diskPath ?? null)
  const isDirty = useEditorStore((state) => {
    const doc = state.openDocs[tabKey]
    return doc ? doc.rawMarkdown !== doc.savedRawMarkdown : false
  })

  if (name === null) return null

  return (
    <div className="group relative flex h-8 min-w-28 max-w-52 shrink-0 items-center">
      <button
        ref={(element) => registerTabRef(tabKey, element)}
        type="button"
        role="tab"
        tabIndex={isActive ? 0 : -1}
        aria-selected={isActive}
        onClick={() => onActivate(tabKey)}
        onKeyDown={(event) => onTabKeyDown(event, index)}
        onAuxClick={(event) => {
          if (event.button !== 1) return
          event.preventDefault()
          onRequestClose(tabKey)
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
        title={diskPath ?? name}
      >
        <span className="truncate">{name}</span>
        {isDirty && (
          <span className="size-1.5 shrink-0 rounded-full bg-info" aria-hidden="true" />
        )}
        {isDirty && <span className="sr-only">{t('workspace.unsaved')}</span>}
      </button>
      <button
        type="button"
        tabIndex={isActive ? 0 : -1}
        aria-label={t('workspace.close-value', { v0: name })}
        title={t('workspace.close-value', { v0: name })}
        className={cn(
          'absolute right-1 z-20 flex size-5.5 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition-[color,background-color,opacity] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100',
          isActive && 'opacity-100'
        )}
        onClick={(event) => {
          event.stopPropagation()
          onRequestClose(tabKey)
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
})

/** 仅在打开多篇文档时展示紧凑工作台标签栏，支持中键关闭与方向键切换。 */
export const TabsBar = memo(function TabsBar({ onRequestClose }: TabsBarProps): React.JSX.Element | null {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

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
  const tabOrderRef = useRef(tabOrder)

  useEffect(() => {
    tabOrderRef.current = tabOrder
  }, [tabOrder])

  const registerTabRef = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) tabRefs.current[key] = element
    else delete tabRefs.current[key]
  }, [])

  /** 支持在标签栏内通过左右方向键切换已打开文档。 */
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const currentOrder = tabOrderRef.current
      if (currentOrder.length === 0) return
      const nextIndex =
        (index + (event.key === 'ArrowRight' ? 1 : -1) + currentOrder.length) % currentOrder.length
      const nextKey = currentOrder[nextIndex]
      if (!nextKey) return
      activateTab(nextKey)
      tabRefs.current[nextKey]?.focus()
    },
    [activateTab]
  )

  // 单文档或无文档时隐藏标签栏，释放纵向写作空间。
  if (tabOrder.length <= 1) return null

  return (
    <div className="relative flex h-9 shrink-0 items-end bg-panel px-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
      <div
        role="tablist"
        aria-label={t('workspace.open-documents')}
        className="inkdown-tabs-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden"
      >
        {tabOrder.map((key, index) => (
          <TabItem
            key={key}
            tabKey={key}
            index={index}
            isActive={key === activeKey}
            mode={mode}
            onActivate={activateTab}
            onRequestClose={onRequestClose}
            onTabKeyDown={handleTabKeyDown}
            registerTabRef={registerTabRef}
          />
        ))}
      </div>
    </div>
  )
})
