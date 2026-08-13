import { useEditorStore } from '../store/editor-store'
import { countWords } from '../lib/outline'

export function StatusBar(): React.JSX.Element {
  const activeKey = useEditorStore((state) => state.activeKey)
  const openDocs = useEditorStore((state) => state.openDocs)
  const mode = useEditorStore((state) => state.mode)
  const doc = activeKey ? openDocs[activeKey] : null
  const wordCount = doc ? countWords(doc.rawMarkdown) : 0
  const dirty = doc ? doc.rawMarkdown !== doc.savedRawMarkdown : false
  const status = doc?.saving ? '正在保存' : dirty ? '未保存' : '已保存'

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-card/70 px-3 text-[11px] text-muted-foreground">
      <span>{mode === 'wysiwyg' ? '所见即所得' : '源码模式'}</span>
      <span>{wordCount} 字</span>
      {doc && <span>{status}</span>}
      <span className="ml-auto">{doc?.diskPath ?? '未保存文档'}</span>
    </footer>
  )
}
