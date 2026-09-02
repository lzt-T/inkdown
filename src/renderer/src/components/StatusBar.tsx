import { countWords } from '@/lib/outline'
import { useEditorStore } from '@/store/editor-store'

/** Renders document mode, count, save state, and location metadata. */
export function StatusBar(): React.JSX.Element {
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
    ? '正在保存'
    : isMissingOnDisk
      ? '文件已删除'
      : dirty
        ? '未保存'
        : '已保存'

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t bg-panel px-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-panel-foreground">
        {mode === 'wysiwyg' ? '所见即所得' : '源码模式'}
      </span>
      <span className="font-mono tabular-nums">{wordCount} 字</span>
      {rawMarkdown !== null && <span>{status}</span>}
      <span className="ml-auto max-w-[55%] truncate font-mono">
        {diskPath ?? '未保存文档'}
      </span>
    </footer>
  )
}
