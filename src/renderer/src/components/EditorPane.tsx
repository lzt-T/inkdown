import { memo, useMemo } from 'react'
import { useEditorStore } from '../store/editor-store'
import { parseOutline } from '../lib/outline'
import { TabsBar } from './TabsBar'
import { MilkdownSurface } from './MilkdownSurface'
import { SourceEditor } from './SourceEditor'
import { Welcome } from './Welcome'

export const EditorPane = memo(function EditorPane(): React.JSX.Element {
  const activeKey = useEditorStore((state) => state.activeKey)
  const hasActiveDoc = useEditorStore((state) => Boolean(activeKey && state.openDocs[activeKey]))
  const rawMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.rawMarkdown ?? '') : ''
  )
  const viewMarkdown = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.viewMarkdown ?? '') : ''
  )
  const diskPath = useEditorStore((state) =>
    activeKey ? (state.openDocs[activeKey]?.diskPath ?? null) : null
  )
  const mode = useEditorStore((state) => state.mode)
  const theme = useEditorStore((state) => state.theme)
  const headingTarget = useEditorStore((state) => state.headingTarget)
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  const consumeHeadingTarget = useEditorStore((state) => state.consumeHeadingTarget)
  const updateActiveMarkdown = useEditorStore((state) => state.updateActiveMarkdown)
  const updateActiveRawMarkdown = useEditorStore((state) => state.updateActiveRawMarkdown)

  const outline = useMemo(() => parseOutline(rawMarkdown), [rawMarkdown])

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <TabsBar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hasActiveDoc ? (
          <Welcome />
        ) : mode === 'wysiwyg' ? (
          <MilkdownSurface
            value={viewMarkdown}
            theme={theme}
            documentPath={diskPath}
            headingTarget={headingTarget}
            onChange={updateActiveMarkdown}
            onActiveHeadingChange={setActiveHeading}
            onConsumeHeadingTarget={consumeHeadingTarget}
          />
        ) : (
          <SourceEditor
            value={rawMarkdown}
            theme={theme}
            outline={outline}
            headingTarget={headingTarget}
            onChange={updateActiveRawMarkdown}
            onActiveHeadingChange={setActiveHeading}
            onConsumeHeadingTarget={consumeHeadingTarget}
          />
        )}
      </div>
    </main>
  )
})
