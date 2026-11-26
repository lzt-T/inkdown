import { t } from '@/lib/i18n'
import { formatErrorMessage } from '@/lib/error-message'
import {
  applyAnchorToWysiwyg,
  captureWysiwygPosition,
  getOutlineHeadings,
  registerModePositionCapture,
  type ModeSyncTarget
} from '@/lib/editor-position-sync'
import { cn } from '@/lib/utils'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MilkdownEditor } from 'zt-react-milkdown'
import { toast } from 'sonner'

// Active heading line sits below the scrollport edge to absorb pixel rounding.
const ACTIVE_HEADING_OFFSET = 12
// 本地图片与远端 HTTPS 图片允许渲染在富文本编辑器中。
const ALLOWED_IMAGE_PROTOCOLS = ['inkdown-file:', 'https:']
const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024
// 富文本同步防抖时长，减少中文连续组词时的全文序列化频率。
const EDITOR_SYNC_DEBOUNCE_MS = 350
// 首次进入富文本且编辑器尚未异步挂载完成时的重试上限与间隔。
const MAX_MODE_SYNC_ATTEMPTS = 20
const MODE_SYNC_RETRY_DELAY_MS = 50

/** 渲染支持本地图片导入、滚动保活与大纲同步的 Milkdown 编辑器。 */
export const MilkdownSurface = memo(function MilkdownSurface({
  documentKey,
  isActive,
  value,
  theme,
  documentPath,
  headingTarget,
  modeSyncTarget,
  onChange,
  onActiveHeadingChange,
  onConsumeHeadingTarget,
  onConsumeModeSyncTarget
}: {
  documentKey: string
  isActive: boolean
  value: string
  theme: 'light' | 'dark'
  documentPath: string | null
  headingTarget: { index: number; nonce: number } | null
  modeSyncTarget: ModeSyncTarget | null
  onChange: (key: string, markdown: string) => void
  onActiveHeadingChange: (index: number) => void
  onConsumeHeadingTarget: () => void
  onConsumeModeSyncTarget: () => void
}): React.JSX.Element {
  // 订阅应用语言，让编辑器通过现有实例热更新内置文案。
  const { i18n } = useTranslation()
  // Container reference scopes heading lookup and editor scroll tracking.
  const containerRef = useRef<HTMLDivElement>(null)
  // Navigation flag prevents programmatic scrolling from replacing the clicked heading.
  const isOutlineNavigationRef = useRef(false)
  // 记录最新文档路径、正文与激活状态，避免滚动、采集与上传闭包捕获旧值。
  const documentPathRef = useRef(documentPath)
  const valueRef = useRef(value)
  const isActiveRef = useRef(isActive)
  // 记录上次上报的活动标题与滚动位置，支持多标签保活恢复与去重通知。
  const lastActiveHeadingRef = useRef<number | null>(null)
  const savedScrollTopRef = useRef(0)

  useEffect(() => {
    documentPathRef.current = documentPath
  }, [documentPath])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  // 为当前激活的富文本视图注册同步位置采集器。
  useEffect(() => {
    if (!isActive) return
    return registerModePositionCapture('wysiwyg', documentKey, () =>
      containerRef.current ? captureWysiwygPosition(containerRef.current, valueRef.current) : null
    )
  }, [isActive, documentKey])

  /** 将图片导入文档资源目录并返回编辑器可访问地址。 */
  const handleUpload = useCallback(async (file: File): Promise<string> => {
    try {
      // Byte payload crosses the preload bridge to the main process.
      const data = new Uint8Array(await file.arrayBuffer())
      // Imported image result contains a local, embedded, or public GitHub URL.
      const result = await window.api.image.import({
        name: file.name || 'image.png',
        data,
        documentPath: documentPathRef.current,
        mimeType: file.type
      })
      if (result.fallbackReason === 'unsaved-document') {
        toast.info(t('workspace.document-is-unsaved-the-image-will-be-embedded-as-a-data-url'))
      }
      if (result.fallbackReason === 'local-import-failed') {
        toast.error(t('workspace.image-import-failed-embedded-as-a-data-url-instead'), {
          description: result.fallbackDescription
        })
      }
      return result.src
    } catch (error) {
      toast.error(t('workspace.image-upload-failed-no-image-inserted'), {
        description: formatErrorMessage(error)
      })
      throw error
    }
  }, [])

  // 稳定图片上传配置引用，避免无谓触发编辑器内部更新。
  const imageUploadConfig = useMemo(
    () => ({
      upload: handleUpload,
      maxFileSize: MAX_UPLOAD_FILE_SIZE,
      allowedProtocols: ALLOWED_IMAGE_PROTOCOLS
    }),
    [handleUpload]
  )

  const handleEditorChange = useCallback(
    (markdown: string) => {
      onChange(documentKey, markdown)
    },
    [documentKey, onChange]
  )

  useEffect(() => {
    if (!isActive || !headingTarget || !containerRef.current) return
    // Filtered headings share the same indexes as the outline panel.
    const headings = getOutlineHeadings(containerRef.current)
    // Requested heading must exist before navigation state changes.
    const targetHeading = headings[headingTarget.index]
    if (!targetHeading) {
      onConsumeHeadingTarget()
      return
    }

    isOutlineNavigationRef.current = true
    lastActiveHeadingRef.current = headingTarget.index
    onActiveHeadingChange(headingTarget.index)
    targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onConsumeHeadingTarget()
  }, [isActive, headingTarget, onActiveHeadingChange, onConsumeHeadingTarget])

  useEffect(() => {
    // Mounted editor container scopes the scrollport and rendered headings.
    const container = containerRef.current
    if (!container) return

    // Scrollable editor reference supports listener cleanup after delayed initialization.
    let editor: HTMLElement | null = null
    // Animation frame batches high-frequency scroll events.
    let animationFrameId: number | null = null
    let timer: number | null = null

    /** Selects the nearest outline heading above the activation line. */
    const updateActiveHeading = (): void => {
      if (!editor || !isActiveRef.current || isOutlineNavigationRef.current) return
      // Current headings reflect Milkdown content and exclude blockquotes.
      const headings = getOutlineHeadings(container)
      if (headings.length === 0) return
      // Activation line tolerates small top-edge alignment differences.
      const activationLine = editor.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET
      // First heading remains active before the document reaches its initial title.
      let activeIndex = 0

      // Ordered scan stops after the first heading below the activation line.
      for (let index = 0; index < headings.length; index += 1) {
        // Heading position determines whether it has crossed the activation line.
        const headingTop = headings[index].getBoundingClientRect().top
        if (headingTop > activationLine) break
        activeIndex = index
      }

      if (lastActiveHeadingRef.current !== activeIndex) {
        lastActiveHeadingRef.current = activeIndex
        onActiveHeadingChange(activeIndex)
      }
    }

    /** Schedules one active-heading calculation for the current animation frame. */
    const handleEditorScroll = (): void => {
      // 仅在视图可见且有布局高度时缓存滚动位置，避免隐藏过渡期间误记为 0。
      if (editor && isActiveRef.current && editor.clientHeight > 0) {
        savedScrollTopRef.current = editor.scrollTop
      }
      if (animationFrameId !== null) return
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null
        updateActiveHeading()
      })
    }

    /** Releases navigation after the browser completes programmatic scrolling. */
    const handleEditorScrollEnd = (): void => {
      if (!isOutlineNavigationRef.current) return
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      isOutlineNavigationRef.current = false
    }

    /** Restores scroll tracking before direct user interaction moves the editor. */
    const handleManualScrollIntent = (): void => {
      if (!isOutlineNavigationRef.current) return
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      isOutlineNavigationRef.current = false
    }

    const bindScrollListeners = (): boolean => {
      editor = container.querySelector<HTMLElement>('.zt-md-editor')
      if (!editor) return false
      editor.addEventListener('scroll', handleEditorScroll, { passive: true })
      editor.addEventListener('scrollend', handleEditorScrollEnd)
      editor.addEventListener('wheel', handleManualScrollIntent, { passive: true })
      editor.addEventListener('pointerdown', handleManualScrollIntent)
      editor.addEventListener('keydown', handleManualScrollIntent)
      updateActiveHeading()
      return true
    }

    // 优先同步绑定，若 Milkdown 节点仍在异步挂载则短暂延迟重试。
    if (!bindScrollListeners()) {
      timer = window.setTimeout(bindScrollListeners, 250)
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      editor?.removeEventListener('scroll', handleEditorScroll)
      editor?.removeEventListener('scrollend', handleEditorScrollEnd)
      editor?.removeEventListener('wheel', handleManualScrollIntent)
      editor?.removeEventListener('pointerdown', handleManualScrollIntent)
      editor?.removeEventListener('keydown', handleManualScrollIntent)
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId)
      isOutlineNavigationRef.current = false
    }
  }, [onActiveHeadingChange])

  // 优先执行源码切回时的双向位置同步，否则按保活标签逻辑恢复上次滚动位置。
  useEffect(() => {
    if (!isActive || !containerRef.current) return
    const container = containerRef.current

    /** 按当前滚动位置计算并上报活动标题。 */
    const syncActiveHeading = (editor: HTMLElement): void => {
      const headings = getOutlineHeadings(container)
      if (headings.length === 0) return
      const activationLine = editor.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET
      let activeIndex = 0
      for (let index = 0; index < headings.length; index += 1) {
        if (headings[index].getBoundingClientRect().top > activationLine) break
        activeIndex = index
      }
      lastActiveHeadingRef.current = activeIndex
      onActiveHeadingChange(activeIndex)
    }

    if (!modeSyncTarget) {
      const frameId = window.requestAnimationFrame(() => {
        const editor = container.querySelector<HTMLElement>('.zt-md-editor')
        if (!editor) return
        if (savedScrollTopRef.current > 0) {
          editor.scrollTop = savedScrollTopRef.current
        }
        syncActiveHeading(editor)
      })
      return () => window.cancelAnimationFrame(frameId)
    }

    let frameId: number | null = null
    let retryTimer: number | null = null
    let attempts = 0

    const tryApplySync = (): void => {
      const applied = applyAnchorToWysiwyg(container, valueRef.current, modeSyncTarget.anchor)
      if (applied) {
        const editor = container.querySelector<HTMLElement>('.zt-md-editor')
        if (editor) {
          savedScrollTopRef.current = editor.scrollTop
          syncActiveHeading(editor)
        }
        onConsumeModeSyncTarget()
        return
      }
      attempts += 1
      if (attempts >= MAX_MODE_SYNC_ATTEMPTS) {
        onConsumeModeSyncTarget()
        return
      }
      retryTimer = window.setTimeout(tryApplySync, MODE_SYNC_RETRY_DELAY_MS)
    }

    frameId = window.requestAnimationFrame(tryApplySync)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [isActive, modeSyncTarget, onActiveHeadingChange, onConsumeModeSyncTarget])

  return (
    <div
      ref={containerRef}
      spellCheck={false}
      className={cn(
        'inkdown-editor-surface min-h-0 flex-1 overflow-hidden',
        !isActive && 'hidden'
      )}
    >
      <MilkdownEditor
        value={value}
        onChange={handleEditorChange}
        theme={theme}
        locale={i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US'}
        maxHeight="100%"
        debounceMs={EDITOR_SYNC_DEBOUNCE_MS}
        className="h-full"
        imageUpload={imageUploadConfig}
      />
    </div>
  )
})
