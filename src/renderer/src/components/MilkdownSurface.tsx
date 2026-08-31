import { useEffect, useRef } from 'react'
import { MilkdownEditor } from 'zt-react-milkdown'
import { toast } from 'sonner'

// Heading selector covers every Markdown heading rendered by ProseMirror.
const HEADING_SELECTOR =
  '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
// Active heading line sits below the scrollport edge to absorb pixel rounding.
const ACTIVE_HEADING_OFFSET = 12

/** Returns headings that belong to the document outline rather than blockquotes. */
function getOutlineHeadings(container: HTMLElement): HTMLElement[] {
  // DOM filtering mirrors the Markdown token filtering in parseOutline.
  const headings = Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
  return headings.filter((heading) => !heading.closest('blockquote'))
}

/** 渲染支持本地图片导入的 Milkdown 编辑器。 */
export function MilkdownSurface({
  value,
  theme,
  documentPath,
  headingTarget,
  onChange,
  onActiveHeadingChange,
  onConsumeHeadingTarget
}: {
  value: string
  theme: 'light' | 'dark'
  documentPath: string | null
  headingTarget: { index: number; nonce: number } | null
  onChange: (markdown: string) => void
  onActiveHeadingChange: (index: number) => void
  onConsumeHeadingTarget: () => void
}): React.JSX.Element {
  // Container reference scopes heading lookup and editor scroll tracking.
  const containerRef = useRef<HTMLDivElement>(null)
  // Navigation flag prevents programmatic scrolling from replacing the clicked heading.
  const isOutlineNavigationRef = useRef(false)

  /** 将图片导入文档资源目录并返回编辑器可访问地址。 */
  const handleUpload = async (file: File): Promise<string> => {
    try {
      // Byte payload crosses the preload bridge to the main process.
      const data = new Uint8Array(await file.arrayBuffer())
      // Imported image result contains a local, embedded, or public GitHub URL.
      const result = await window.api.image.import({
        name: file.name || 'image.png',
        data,
        documentPath,
        mimeType: file.type
      })
      if (result.fallbackReason === 'unsaved-document') {
        toast.info('文档尚未保存，图片将以 Data URL 嵌入')
      }
      if (result.fallbackReason === 'local-import-failed') {
        toast.error('图片导入失败，已回退为 Data URL', {
          description: result.fallbackDescription
        })
      }
      return result.src
    } catch (error) {
      toast.error('图片上传失败，未插入图片', { description: String(error) })
      throw error
    }
  }

  // 图片上传配置允许受保护的本地协议和 GitHub 返回的 HTTPS 地址。
  const imageUploadConfig = {
    upload: handleUpload,
    maxFileSize: 10 * 1024 * 1024,
    allowedProtocols: ['inkdown-file:', 'https:']
  }

  useEffect(() => {
    if (!headingTarget || !containerRef.current) return
    // Filtered headings share the same indexes as the outline panel.
    const headings = getOutlineHeadings(containerRef.current)
    // Requested heading must exist before navigation state changes.
    const targetHeading = headings[headingTarget.index]
    if (!targetHeading) {
      onConsumeHeadingTarget()
      return
    }

    isOutlineNavigationRef.current = true
    onActiveHeadingChange(headingTarget.index)
    targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onConsumeHeadingTarget()
  }, [headingTarget, onActiveHeadingChange, onConsumeHeadingTarget])

  useEffect(() => {
    // Mounted editor container scopes the scrollport and rendered headings.
    const container = containerRef.current
    if (!container) return

    // Scrollable editor reference supports listener cleanup after delayed initialization.
    let editor: HTMLElement | null = null
    // Animation frame batches high-frequency scroll events.
    let animationFrameId: number | null = null

    /** Selects the nearest outline heading above the activation line. */
    const updateActiveHeading = (): void => {
      if (!editor || isOutlineNavigationRef.current) return
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

      onActiveHeadingChange(activeIndex)
    }

    /** Schedules one active-heading calculation for the current animation frame. */
    const handleEditorScroll = (): void => {
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

    // Delayed setup waits for Milkdown to render its ProseMirror document.
    const timer = window.setTimeout(() => {
      // Scrollable editor element bounds heading visibility calculations.
      editor = container.querySelector<HTMLElement>('.zt-md-editor')
      if (!editor) return
      editor.addEventListener('scroll', handleEditorScroll, { passive: true })
      editor.addEventListener('scrollend', handleEditorScrollEnd)
      editor.addEventListener('wheel', handleManualScrollIntent, { passive: true })
      editor.addEventListener('pointerdown', handleManualScrollIntent)
      editor.addEventListener('keydown', handleManualScrollIntent)
      updateActiveHeading()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      editor?.removeEventListener('scroll', handleEditorScroll)
      editor?.removeEventListener('scrollend', handleEditorScrollEnd)
      editor?.removeEventListener('wheel', handleManualScrollIntent)
      editor?.removeEventListener('pointerdown', handleManualScrollIntent)
      editor?.removeEventListener('keydown', handleManualScrollIntent)
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId)
      isOutlineNavigationRef.current = false
    }
  }, [value, theme, onActiveHeadingChange])

  return (
    <div
      ref={containerRef}
      spellCheck={false}
      className="inkdown-editor-surface min-h-0 flex-1 overflow-hidden"
    >
      <MilkdownEditor
        value={value}
        onChange={onChange}
        theme={theme}
        locale="zh-CN"
        placeholder="输入 Markdown，输入 / 唤起命令菜单..."
        maxHeight="100%"
        debounceMs={160}
        className="h-full"
        imageUpload={imageUploadConfig}
      />
    </div>
  )
}
