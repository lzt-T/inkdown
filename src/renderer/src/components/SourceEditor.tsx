import { useTranslation } from 'react-i18next'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
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
import {
  BOTTOM_SNAP_THRESHOLD_PX,
  clamp,
  registerModePositionCapture,
  SYNC_VIEWPORT_OFFSET,
  TOP_SNAP_THRESHOLD_PX,
  type ModeSyncAnchor,
  type ModeSyncTarget
} from '@/lib/editor-position-sync'
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

/** 从 CodeMirror 源码编辑器当前视口采集行级位置锚点。 */
function captureSourcePosition(view: EditorView): ModeSyncAnchor | null {
  const scrollEl = view.scrollDOM
  if (scrollEl.clientHeight <= 0) return null

  const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
  const scrollRatio = maxScroll > 0 ? clamp(scrollEl.scrollTop / maxScroll, 0, 1) : 0

  if (scrollEl.scrollTop <= TOP_SNAP_THRESHOLD_PX) {
    return { line: 1, lineProgress: 0, scrollRatio: 0 }
  }
  if (maxScroll > 0 && scrollEl.scrollTop >= maxScroll - BOTTOM_SNAP_THRESHOLD_PX) {
    return { line: view.state.doc.lines, lineProgress: 0.999, scrollRatio: 1 }
  }

  const referenceY = scrollEl.getBoundingClientRect().top + SYNC_VIEWPORT_OFFSET
  // view.documentTop 已直接指向首行顶部（已扣除 .cm-content 的上内边距）。
  const docHeightOffset = Math.max(0, referenceY - view.documentTop)
  const block = view.lineBlockAtHeight(docHeightOffset)
  const docLine = view.state.doc.lineAt(block.from)
  const lineProgress =
    block.height > 0 ? clamp((docHeightOffset - block.top) / block.height, 0, 0.999) : 0

  return { line: docLine.number, lineProgress, scrollRatio }
}

/** 将位置锚点应用到源码编辑器，返回用于取消待执行对齐帧的清理函数。 */
function applyAnchorToSource(view: EditorView, anchor: ModeSyncAnchor): () => void {
  const scrollEl = view.scrollDOM

  if (anchor.line <= 1 && anchor.lineProgress <= 0 && anchor.scrollRatio <= 0.001) {
    view.dispatch({ selection: { anchor: 0 } })
    scrollEl.scrollTop = 0
    return () => {}
  }

  if (anchor.scrollRatio >= 0.999 && anchor.line >= view.state.doc.lines) {
    const lastLine = view.state.doc.line(view.state.doc.lines)
    view.dispatch({ selection: { anchor: lastLine.from } })
    scrollEl.scrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    const frameId = window.requestAnimationFrame(() => {
      if (!view.dom.isConnected) return
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    })
    return () => window.cancelAnimationFrame(frameId)
  }

  const targetLineNumber = clamp(Math.floor(anchor.line), 1, view.state.doc.lines)
  const lineObj = view.state.doc.line(targetLineNumber)

  // 先借助 CodeMirror 自身 scrollIntoView 滚动到目标行区域，触发软换行真实高度测量。
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: 'start', yMargin: SYNC_VIEWPORT_OFFSET })
  })

  // 在下一帧读取已完成布局测量的行块坐标，按行内比例精确微调滚动位置。
  const frameId = window.requestAnimationFrame(() => {
    if (!view.dom.isConnected) return
    const nextMaxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    const block = view.lineBlockAt(lineObj.from)
    const contentTopOffset =
      scrollEl.scrollTop + (view.documentTop - scrollEl.getBoundingClientRect().top)
    const targetScrollTop =
      contentTopOffset + block.top + anchor.lineProgress * block.height - SYNC_VIEWPORT_OFFSET
    scrollEl.scrollTop = clamp(targetScrollTop, 0, nextMaxScroll)
  })

  return () => window.cancelAnimationFrame(frameId)
}

/** 展示源码编辑器并在语言变化时保留编辑状态。 */
export const SourceEditor = memo(function SourceEditor({
  documentKey,
  value,
  theme,
  headingTarget,
  modeSyncTarget,
  onChange,
  onActiveHeadingChange,
  onConsumeHeadingTarget,
  onConsumeModeSyncTarget
}: {
  documentKey: string
  value: string
  theme: 'light' | 'dark'
  headingTarget: { index: number; nonce: number } | null
  modeSyncTarget: ModeSyncTarget | null
  onChange: (markdown: string) => void
  onActiveHeadingChange: (index: number) => void
  onConsumeHeadingTarget: () => void
  onConsumeModeSyncTarget: () => void
}): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  // 语言决定短语扩展，交由现有封装重配置而非重建编辑器。
  const { i18n } = useTranslation()

  const ref = useRef<ReactCodeMirrorRef>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pendingSyncTargetRef = useRef<ModeSyncTarget | null>(null)
  const syncCleanupRef = useRef<(() => void) | null>(null)
  // 延迟解析源码大纲，避免大文档打字期间同步阻塞按键响应。
  const deferredValue = useDeferredValue(value)
  // CodeMirror 内部统一使用 LF，传入前规范化换行符，避免挂载后因 CRLF 差异触发全量替换重置选区与大纲高亮。
  const normalizedValue = useMemo(() => value.replace(/\r\n?/g, '\n'), [value])
  const outline = useMemo(() => parseOutline(deferredValue), [deferredValue])
  // 通过 ref 向编辑器监听器和跳转效果提供最新大纲，避免扩展实例频繁重建。
  const outlineRef = useRef(outline)
  useEffect(() => {
    outlineRef.current = outline
  }, [outline])

  /** 在 CodeMirror 视图可用时消费待处理的模式切换同步目标。 */
  const applyPendingModeSync = useCallback(() => {
    const view = viewRef.current ?? ref.current?.view
    const target = pendingSyncTargetRef.current
    if (!view || !target) return
    pendingSyncTargetRef.current = null
    syncCleanupRef.current?.()
    syncCleanupRef.current = applyAnchorToSource(view, target.anchor)
    onConsumeModeSyncTarget()
  }, [onConsumeModeSyncTarget])

  /** 缓存刚创建好的 EditorView 引用，并立即应用挂起的同步位置。 */
  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      viewRef.current = view
      applyPendingModeSync()
    },
    [applyPendingModeSync]
  )

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

  // 为当前源码编辑器注册同步位置采集器，并在卸载时清理挂起的对齐帧。
  useEffect(() => {
    const unregister = registerModePositionCapture('source', documentKey, () => {
      const view = viewRef.current ?? ref.current?.view
      return view ? captureSourcePosition(view) : null
    })
    return () => {
      unregister()
      syncCleanupRef.current?.()
      syncCleanupRef.current = null
    }
  }, [documentKey])

  // 接收切入源码模式的位置同步指令，待视图就绪后立即滚动对齐。
  useEffect(() => {
    if (!modeSyncTarget) return
    pendingSyncTargetRef.current = modeSyncTarget
    applyPendingModeSync()
  }, [modeSyncTarget, applyPendingModeSync])

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
        value={normalizedValue}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        theme={themeExtension}
        extensions={extensions}
        height="100%"
        basicSetup={SOURCE_BASIC_SETUP}
      />
    </div>
  )
})
