import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { countWords } from '@/lib/outline'
import { useEditorStore } from '@/store/editor-store'

/** Renders document mode, count, save state, and location metadata. */
export function StatusBar(): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Active key selects document-specific status data.
  const activeKey = useEditorStore((state) => state.activeKey)
  // Editor mode labels the active editing surface.
  const mode = useEditorStore((state) => state.mode)
  // Raw Markdown supplies the word count and dirty comparison.
  const rawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.rawMarkdown ?? null) : null
  )
  // Saved Markdown establishes the clean document baseline.
  const savedRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.savedRawMarkdown ?? null) : null
  )
  // Saving state communicates an active disk write.
  const saving = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.saving ?? false) : false
  )
  // 磁盘缺失状态提示当前缓冲区需要另存为。
  const isMissingOnDisk = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.isMissingOnDisk ?? false) : false
  )
  // Disk path identifies the active file location.
  const diskPath = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.diskPath ?? null) : null
  )
  // Word count measures the current Markdown content.
  const wordCount = rawMarkdown === null ? 0 : countWords(rawMarkdown)
  // Dirty state detects unsaved content changes.
  const dirty = rawMarkdown !== null && rawMarkdown !== savedRawMarkdown
  // 状态文案优先显示进行中的保存，其次提示磁盘文件缺失。
  const status = saving
    ? t('workspace.saving')
    : isMissingOnDisk
      ? t('workspace.file-deleted')
      : dirty
        ? t('workspace.unsaved')
        : t('workspace.saved')

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t bg-panel px-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-panel-foreground">
        {mode === 'wysiwyg' ? t('workspace.rich-text') : t('workspace.source')}
      </span>
      <span className="font-mono tabular-nums">{t('workspace.word-count', { count: wordCount })}</span>
      {rawMarkdown !== null && <span>{status}</span>}
      <span className="ml-auto max-w-[55%] truncate font-mono">
        {diskPath ?? t('workspace.unsaved-document')}
      </span>
    </footer>
  )
}
