import { useTranslation } from 'react-i18next'
import { lazy, memo, Suspense, useState } from 'react'
import { AlertTriangle, FileDown, RotateCcw } from 'lucide-react'
import { TabsBar } from '@/components/TabsBar'
import { Welcome } from '@/components/Welcome'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useEditorStore } from '@/store/editor-store'
import type { ThemeMode } from '../../../shared/contracts'

// 按需懒加载重型编辑器模块，降低欢迎页冷启动与单模式切换的解析开销。
const LazyMilkdownSurface = lazy(() =>
  import('@/components/MilkdownSurface').then((module) => ({ default: module.MilkdownSurface }))
)
const LazySourceEditor = lazy(() =>
  import('@/components/SourceEditor').then((module) => ({ default: module.SourceEditor }))
)

interface EditorPaneProps {
  onNewFile: () => void
  onRequestCloseTab: (key: string) => void
}

/** 独立订阅单个保活文档的所见即所得视图状态，避免编辑或切页触发兄弟标签重渲染。 */
const MilkdownTabSlot = memo(function MilkdownTabSlot({
  docKey,
  isActive,
  theme
}: {
  docKey: string
  isActive: boolean
  theme: ThemeMode
}): React.JSX.Element | null {
  const viewMarkdown = useEditorStore((state) => state.openDocs[docKey]?.viewMarkdown ?? null)
  const diskPath = useEditorStore((state) => state.openDocs[docKey]?.diskPath ?? null)
  const headingTarget = useEditorStore((state) => (isActive ? state.headingTarget : null))
  const updateDocumentMarkdown = useEditorStore((state) => state.updateDocumentMarkdown)
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  const consumeHeadingTarget = useEditorStore((state) => state.consumeHeadingTarget)

  if (viewMarkdown === null) return null

  return (
    <LazyMilkdownSurface
      documentKey={docKey}
      isActive={isActive}
      value={viewMarkdown}
      theme={theme}
      documentPath={diskPath}
      headingTarget={headingTarget}
      onChange={updateDocumentMarkdown}
      onActiveHeadingChange={setActiveHeading}
      onConsumeHeadingTarget={consumeHeadingTarget}
    />
  )
})

/** 独立订阅当前活动文档的源码视图状态，隔离编辑器输入对壳层的重渲染影响。 */
const SourceEditorSlot = memo(function SourceEditorSlot({
  docKey,
  theme
}: {
  docKey: string
  theme: ThemeMode
}): React.JSX.Element | null {
  const rawMarkdown = useEditorStore((state) => state.openDocs[docKey]?.rawMarkdown ?? null)
  const headingTarget = useEditorStore((state) => state.headingTarget)
  const updateActiveRawMarkdown = useEditorStore((state) => state.updateActiveRawMarkdown)
  const setActiveHeading = useEditorStore((state) => state.setActiveHeading)
  const consumeHeadingTarget = useEditorStore((state) => state.consumeHeadingTarget)

  if (rawMarkdown === null) return null

  return (
    <LazySourceEditor
      value={rawMarkdown}
      theme={theme}
      headingTarget={headingTarget}
      onChange={updateActiveRawMarkdown}
      onActiveHeadingChange={setActiveHeading}
      onConsumeHeadingTarget={consumeHeadingTarget}
    />
  )
})

/** 展示活动文档、磁盘缺失恢复横幅，并将统一的新建入口传递给欢迎页。 */
export const EditorPane = memo(function EditorPane({
  onNewFile,
  onRequestCloseTab
}: EditorPaneProps): React.JSX.Element {
  useTranslation()

  const activeKey = useEditorStore((state) => state.activeKey)
  const hasActiveDoc = useEditorStore((state) =>
    Boolean(state.activeKey && state.openDocs[state.activeKey])
  )
  const isMissingOnDisk = useEditorStore((state) =>
    state.activeKey ? (state.openDocs[state.activeKey]?.isMissingOnDisk ?? false) : false
  )
  const recentTabKeys = useEditorStore((state) => state.recentTabKeys)
  const mode = useEditorStore((state) => state.mode)
  const theme = useEditorStore((state) => state.theme)
  const restoreMissingDocument = useEditorStore((state) => state.restoreMissingDocument)
  const saveActiveAs = useEditorStore((state) => state.saveActiveAs)
  const [isRestoring, setIsRestoring] = useState(false)

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
        {!hasActiveDoc || !activeKey ? (
          <Welcome onNewFile={onNewFile} />
        ) : mode === 'wysiwyg' ? (
          <Suspense fallback={<div className="min-h-0 flex-1 bg-background" />}>
            {recentTabKeys.map((tabKey) => (
              <MilkdownTabSlot
                key={tabKey}
                docKey={tabKey}
                isActive={tabKey === activeKey}
                theme={theme}
              />
            ))}
          </Suspense>
        ) : (
          <Suspense fallback={<div className="min-h-0 flex-1 bg-background" />}>
            <SourceEditorSlot key={activeKey} docKey={activeKey} theme={theme} />
          </Suspense>
        )}
      </div>
    </main>
  )
})
