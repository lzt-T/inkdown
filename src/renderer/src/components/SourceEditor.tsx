import { useEffect, useMemo, useRef } from 'react'
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import type { OutlineItem } from '../lib/outline'

function activeHeadingForLine(outline: OutlineItem[], line: number): number {
  let active = 0
  for (let index = 0; index < outline.length; index += 1) {
    if (outline[index].line <= line) active = index
    else break
  }
  return active
}

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
    <div className="h-full overflow-hidden">
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        theme={themeExtension}
        extensions={[markdown(), EditorView.lineWrapping, themeExtension, listenerExtension]}
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

