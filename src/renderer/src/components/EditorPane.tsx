import { useTranslation } from 'react-i18next'
import { memo, useMemo, useState } from 'react'
import { AlertTriangle, FileDown, RotateCcw } from 'lucide-react'
import { MilkdownSurface } from '@/components/MilkdownSurface'
import { SourceEditor } from '@/components/SourceEditor'
import { TabsBar } from '@/components/TabsBar'
import { Welcome } from '@/components/Welcome'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { parseOutline } from '@/lib/outline'
import { useEditorStore } from '@/store/editor-store'

interface EditorPaneProps {
  onNewFile: () => void
  onRequestCloseTab: (key: string) => void
}

/** 展示活动文档、磁盘缺失恢复横幅，并将统一的新建入口传递给欢迎页。 */
export const EditorPane = memo(function EditorPane({
  onNewFile,
  onRequestCloseTab
}: EditorPaneProps): React.JSX.Element {
  useTranslation()

  const activeKey = useEditorStore((state) => state.activeKey)
  const activeDoc = useEditorStore((state) => (activeKey ? (state.openDocs[activeKey] ?? null) : null))
  const hasActiveDoc = Boolean(activeDoc)
  const rawMarkdown = activeDoc?.rawMarkdown ?? ''
  const viewMarkdown = activeDoc?.viewMarkdown ?? ''
  const diskPath = activeDoc?.diskPath ?? null
  const isMissingOnDisk = activeDoc?.isMissingOnDisk ?? false
  const mode = useEditorStore((state) => state.mode)
  const theme = useEditorStore((state) => state.theme)
  const headingTarget = useEditorStore((state) => state.headingTarget)
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  const consumeHeadingTarget = useEditorStore((state) => state.consumeHeadingTarget)
  const updateActiveMarkdown = useEditorStore((state) => state.updateActiveMarkdown)
  const updateActiveRawMarkdown = useEditorStore((state) => state.updateActiveRawMarkdown)
  const restoreMissingDocument = useEditorStore((state) => state.restoreMissingDocument)
  const saveActiveAs = useEditorStore((state) => state.saveActiveAs)
  const [isRestoring, setIsRestoring] = useState(false)

  const outline = useMemo(() => parseOutline(rawMarkdown), [rawMarkdown])

  /** 将内存中保留的文档重新写回原路径，并在目录缺失时回退另存为。 */
  const handleRestoreMissing = async (): Promise<void> => {
    if (!activeKey || isRestoring) return
    setIsRestoring(true)
    try {
      await restoreMissingDocument(activeKey)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <TabsBar onRequestClose={onRequestCloseTab} />
      {hasActiveDoc && isMissingOnDisk && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-warning/10 px-4 py-2 text-xs text-foreground"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="truncate">{t('workspace.missing-file-banner')}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isRestoring}
              onClick={() => void handleRestoreMissing()}
            >
              <RotateCcw />
              {t('workspace.resave-to-original')}
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={isRestoring}
              onClick={() => void saveActiveAs()}
            >
              <FileDown />
              {t('workspace.save-as')}
            </Button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hasActiveDoc ? (
          <Welcome onNewFile={onNewFile} />
        ) : mode === 'wysiwyg' ? (
          <MilkdownSurface
            key={activeKey}
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
