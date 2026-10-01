import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef } from 'react'
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  searchPanelOpen,
  setSearchQuery
} from '@codemirror/search'
import type { OutlineItem } from '@/lib/outline'
import { sourceEditorPhrases } from '@/lib/source-editor-phrases'

function activeHeadingForLine(outline: OutlineItem[], line: number): number {
  let active = 0
  for (let index = 0; index < outline.length; index += 1) {
    if (outline[index].line <= line) active = index
    else break
  }
  return active
}

/** 展示源码编辑器并在语言变化时保留编辑状态。 */
export function SourceEditor({
  value,
  theme,
  outline,
  headingTarget,
  onChange,
  onActiveHeadingChange,
  onConsumeHeadingTarget
}: {
  value: string
  theme: 'light' | 'dark'
  outline: OutlineItem[]
  headingTarget: { index: number; nonce: number } | null
  onChange: (markdown: string) => void
  onActiveHeadingChange: (index: number) => void
  onConsumeHeadingTarget: () => void
}): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  // 语言决定短语扩展，交由现有封装重配置而非重建编辑器。
  const { i18n } = useTranslation()

  const ref = useRef<ReactCodeMirrorRef>(null)

  const themeExtension = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)'
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.75'
          },
          '.cm-content': {
            maxWidth: '820px',
            margin: '0 auto',
            padding: '36px 24px 120px',
            caretColor: 'var(--foreground)'
          },
          '.cm-gutters': {
            backgroundColor: 'var(--background)',
            color: 'var(--muted-foreground)',
            borderRight: '1px solid var(--border)'
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)'
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            color: 'var(--foreground)'
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)'
          }
        },
        { dark: theme === 'dark' }
      ),
    [theme]
  )

  const listenerExtension = useMemo(
    () =>
      EditorView.updateListener.of((event) => {
        if (event.selectionSet || event.docChanged) {
          const line = event.state.doc.lineAt(event.state.selection.main.head).number
          onActiveHeadingChange(activeHeadingForLine(outline, line))
        }
      }),
    [outline, onActiveHeadingChange]
  )

  useEffect(() => {
    // 已打开的搜索面板需重新读取短语，不重建编辑器或清空搜索查询。
    const view = ref.current?.view
    if (!view || !searchPanelOpen(view.state)) return
    // 语言选择控件保留焦点，编辑器滚动位置保持不变。
    const focusedElement = document.activeElement
    // 保存搜索与替换条件，避免重新打开面板采用当前选区文本。
    const searchQuery = getSearchQuery(view.state)
    // 搜索面板开关不会改变编辑器文档、选区或撤销历史。
    const scrollTop = view.scrollDOM.scrollTop
    // 横向滚动同样保留，避免长行视图跳动。
    const scrollLeft = view.scrollDOM.scrollLeft
    closeSearchPanel(view)
    openSearchPanel(view)
    view.dispatch({ effects: setSearchQuery.of(searchQuery) })
    view.scrollDOM.scrollTop = scrollTop
    view.scrollDOM.scrollLeft = scrollLeft
    if (focusedElement instanceof HTMLElement) focusedElement.focus({ preventScroll: true })
  }, [i18n.resolvedLanguage])

  useEffect(() => {
    if (!headingTarget || !ref.current?.view) return
    const view = ref.current.view
    const item = outline[headingTarget.index]
    if (!item) return
    const line = Math.min(item.line, view.state.doc.lines)
    const position = view.state.doc.line(line).from
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 20 })
    })
    onConsumeHeadingTarget()
  }, [headingTarget, outline, onConsumeHeadingTarget])

  return (
    <div className="inkdown-source-surface min-h-0 flex-1 overflow-hidden">
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        theme={themeExtension}
        extensions={[
          markdown(),
          EditorView.lineWrapping,
          themeExtension,
          listenerExtension,
          EditorState.phrases.of(i18n.resolvedLanguage === 'zh-CN' ? sourceEditorPhrases : {})
        ]}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          autocompletion: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true
        }}
      />
    </div>
  )
}
