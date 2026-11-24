import { useTranslation } from 'react-i18next'
import { memo, useDeferredValue, useMemo } from 'react'
import { t } from '@/lib/i18n'
import { relativeFromDirectory } from '@/lib/markdown-paths'
import { countWords } from '@/lib/outline'
import { formatShortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'

// 状态键到指示圆点样式的纯映射表，避免堆叠分支。
const STATUS_DOT_STYLES = {
  saving: 'bg-info animate-pulse',
  missing: 'bg-warning',
  dirty: 'bg-info',
  saved: 'bg-success'
} as const

/** 展示当前活动文档的交互式模式切换、字数、保存状态与精简路径。 */
export const StatusBar = memo(function StatusBar(): React.JSX.Element | null {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  const workspaceRoot = useEditorStore((state) => state.workspaceRoot)
  const mode = useEditorStore((state) => state.mode)
  const toggleMode = useEditorStore((state) => state.toggleMode)
  const rawMarkdown = useEditorStore((state) =>
    state.activeKey ? (state.openDocs[state.activeKey]?.rawMarkdown ?? null) : null
  )
  const diskPath = useEditorStore((state) =>
    state.activeKey ? (state.openDocs[state.activeKey]?.diskPath ?? null) : null
  )
  const saving = useEditorStore((state) =>
    state.activeKey ? (state.openDocs[state.activeKey]?.saving ?? false) : false
  )
  const isMissingOnDisk = useEditorStore((state) =>
    state.activeKey ? (state.openDocs[state.activeKey]?.isMissingOnDisk ?? false) : false
  )
  const dirty = useEditorStore((state) => {
    const doc = state.activeKey ? state.openDocs[state.activeKey] : null
    return doc ? doc.rawMarkdown !== doc.savedRawMarkdown : false
  })

  // 延迟统计字数并缓存结果，防止长文档输入期同步阻塞按键。
  const deferredMarkdown = useDeferredValue(rawMarkdown ?? '')
  const wordCount = useMemo(() => countWords(deferredMarkdown), [deferredMarkdown])

  if (rawMarkdown === null) return null

  const statusKey = saving
    ? 'saving'
    : isMissingOnDisk
      ? 'missing'
      : dirty
        ? 'dirty'
        : 'saved'
  const statusLabel = saving
    ? t('workspace.saving')
    : isMissingOnDisk
      ? t('workspace.file-deleted')
      : dirty
        ? t('workspace.unsaved')
        : t('workspace.saved')

  // 位于工作区内时仅显示相对路径，减少长前缀视觉噪声。
  const displayPath = diskPath
    ? workspaceRoot
      ? relativeFromDirectory(workspaceRoot, diskPath)
      : diskPath
    : t('workspace.unsaved-document')

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t bg-panel px-3 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={toggleMode}
        title={`${t('workspace.toggle-source-mode')} (${formatShortcut(['/'])})`}
        className="inline-flex h-5 items-center rounded-sm px-1.5 font-medium text-panel-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {mode === 'wysiwyg' ? t('workspace.rich-text') : t('workspace.source')}
      </button>
      <span className="font-mono tabular-nums">{t('workspace.word-count', { count: wordCount })}</span>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', STATUS_DOT_STYLES[statusKey])}
        />
        <span className={cn(isMissingOnDisk && 'font-medium text-warning')}>
          {statusLabel}
        </span>
      </span>
      <span
        className="ml-auto max-w-[55%] truncate font-mono"
        title={diskPath ?? t('workspace.unsaved-document')}
      >
        {displayPath}
      </span>
    </footer>
  )
})
