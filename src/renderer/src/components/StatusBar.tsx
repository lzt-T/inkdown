import { useEditorStore } from '../store/editor-store'
import { countWords } from '../lib/outline'

export function StatusBar(): React.JSX.Element {
  const activeKey = useEditorStore((state) => state.activeKey)
  const mode = useEditorStore((state) => state.mode)
  const rawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.rawMarkdown ?? null) : null
  )
  const savedRawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.savedRawMarkdown ?? null) : null
  )
  const saving = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.saving ?? false) : false
  )
  const diskPath = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.diskPath ?? null) : null
  )
  const wordCount = rawMarkdown === null ? 0 : countWords(rawMarkdown)
  const dirty = rawMarkdown !== null && rawMarkdown !== savedRawMarkdown
  const status = saving ? '正在保存' : dirty ? '未保存' : '已保存'

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-card/70 px-3 text-[11px] text-muted-foreground">
      <span>{mode === 'wysiwyg' ? '所见即所得' : '源码模式'}</span>
      <span>{wordCount} 字</span>
      {rawMarkdown !== null && <span>{status}</span>}
      <span className="ml-auto">{diskPath ?? '未保存文档'}</span>
    </footer>
  )
}
