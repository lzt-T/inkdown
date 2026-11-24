import { useTranslation } from 'react-i18next'
import { memo, useDeferredValue, useEffect, useMemo, useRef } from 'react'
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
import { parseOutline, type OutlineItem } from '@/lib/outline'
import { sourceEditorPhrases } from '@/lib/source-editor-phrases'

// 提升稳定扩展与配置常量，避免每次组件重渲染触发 CodeMirror 重新配置。
const MARKDOWN_EXTENSION = markdown()
const ZH_PHRASES_EXTENSION = EditorState.phrases.of(sourceEditorPhrases)
const EMPTY_PHRASES_EXTENSION = EditorState.phrases.of({})
const SOURCE_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  autocompletion: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true
} as const

function activeHeadingForLine(outline: OutlineItem[], line: number): number {
  let active = 0
  for (let index = 0; index < outline.length; index += 1) {
    if (outline[index].line <= line) active = index
    else break
  }
  return active
}

/** 展示源码编辑器并在语言变化时保留编辑状态。 */
export const SourceEditor = memo(function SourceEditor({
  value,
  theme,
  headingTarget,
  onChange,
  onActiveHeadingChange,
  onConsumeHeadingTarget
}: {
  value: string
  theme: 'light' | 'dark'
  headingTarget: { index: number; nonce: number } | null
  onChange: (markdown: string) => void
  onActiveHeadingChange: (index: number) => void
  onConsumeHeadingTarget: () => void
}): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  // 语言决定短语扩展，交由现有封装重配置而非重建编辑器。
  const { i18n } = useTranslation()

  const ref = useRef<ReactCodeMirrorRef>(null)
  // 延迟解析源码大纲，避免大文档打字期间同步阻塞按键响应。
  const deferredValue = useDeferredValue(value)
  const outline = useMemo(() => parseOutline(deferredValue), [deferredValue])
  // 通过 ref 向编辑器监听器和跳转效果提供最新大纲，避免扩展实例频繁重建。
  const outlineRef = useRef(outline)
  useEffect(() => {
    outlineRef.current = outline
  }, [outline])

  const themeExtension = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)'
          },
          '.cm-content': {
            caretColor: 'var(--foreground)'
          },
          '.cm-gutters': {
            backgroundColor: 'var(--background)',
            color: 'var(--muted-foreground)',
            borderRight: '1px solid color-mix(in srgb, var(--border) 60%, transparent)'
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 4%, transparent)'
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
            color: 'var(--foreground)'
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--ring) 20%, transparent)'
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
          onActiveHeadingChange(activeHeadingForLine(outlineRef.current, line))
        }
      }),
    [onActiveHeadingChange]
  )

  const phrasesExtension =
    i18n.resolvedLanguage === 'zh-CN' ? ZH_PHRASES_EXTENSION : EMPTY_PHRASES_EXTENSION

  // 稳定扩展数组引用，确保编辑过程中不会重复执行 StateEffect.reconfigure。
  const extensions = useMemo(
    () => [MARKDOWN_EXTENSION, EditorView.lineWrapping, listenerExtension, phrasesExtension],
    [listenerExtension, phrasesExtension]
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
    const item = outlineRef.current[headingTarget.index]
    if (!item) return
    const line = Math.min(item.line, view.state.doc.lines)
    const position = view.state.doc.line(line).from
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 20 })
    })
    onConsumeHeadingTarget()
  }, [headingTarget, onConsumeHeadingTarget])

  return (
    <div className="inkdown-source-surface min-h-0 flex-1 overflow-hidden">
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        theme={themeExtension}
        extensions={extensions}
        height="100%"
        basicSetup={SOURCE_BASIC_SETUP}
      />
    </div>
  )
})
