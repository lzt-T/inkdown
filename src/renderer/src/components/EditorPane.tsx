import { useMemo } from 'react'
import { useEditorStore } from '../store/editor-store'
import { parseOutline } from '../lib/outline'
import { TabsBar } from './TabsBar'
import { MilkdownSurface } from './MilkdownSurface'
import { SourceEditor } from './SourceEditor'
import { Welcome } from './Welcome'

export function EditorPane(): React.JSX.Element {
  const activeKey = useEditorStore((state) => state.activeKey)
  const openDocs = useEditorStore((state) => state.openDocs)
  const mode = useEditorStore((state) => state.mode)
  const theme = useEditorStore((state) => state.theme)
  const headingTarget = useEditorStore((state) => state.headingTarget)
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  const consumeHeadingTarget = useEditorStore((state) => state.consumeHeadingTarget)
  const updateActiveMarkdown = useEditorStore((state) => state.updateActiveMarkdown)
  const updateActiveRawMarkdown = useEditorStore((state) => state.updateActiveRawMarkdown)

  const activeDoc = activeKey ? openDocs[activeKey] : null
  const outline = useMemo(() => parseOutline(activeDoc?.rawMarkdown ?? ''), [activeDoc?.rawMarkdown])

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <TabsBar />
      {!activeDoc ? (
        <Welcome />
      ) : mode === 'wysiwyg' ? (
        <MilkdownSurface
          value={activeDoc.viewMarkdown}
          theme={theme}
          documentPath={activeDoc.diskPath}
          headingTarget={headingTarget}
          onChange={updateActiveMarkdown}
          onActiveHeadingChange={setActiveHeading}
          onConsumeHeadingTarget={consumeHeadingTarget}
        />
      ) : (
        <SourceEditor
          value={activeDoc.rawMarkdown}
          theme={theme}
          outline={outline}
          headingTarget={headingTarget}
          onChange={updateActiveRawMarkdown}
          onActiveHeadingChange={setActiveHeading}
          onConsumeHeadingTarget={consumeHeadingTarget}
        />
      )}
    </main>
  )
}
