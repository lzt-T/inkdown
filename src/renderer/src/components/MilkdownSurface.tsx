import { useEffect, useRef } from 'react'
import { MilkdownEditor } from 'zt-react-milkdown'
import { toast } from 'sonner'
import { dirname } from '../lib/markdown-paths'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

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
  const containerRef = useRef<HTMLDivElement>(null)

  const handleUpload = async (file: File): Promise<string> => {
    if (!documentPath) {
      toast.info('文档尚未保存，图片将以 Data URL 嵌入')
      return fileToDataUrl(file)
    }

    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const result = await window.api.image.import({
        name: file.name || 'image.png',
        data,
        targetDir: `${dirname(documentPath)}/assets`
      })
      return result.src
    } catch (error) {
      toast.error('图片导入失败，已回退为 Data URL', { description: String(error) })
      return fileToDataUrl(file)
    }
  }

  useEffect(() => {
    if (!headingTarget || !containerRef.current) return
    const headings = containerRef.current.querySelectorAll<HTMLElement>(
      '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    )
    headings[headingTarget.index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onConsumeHeadingTarget()
  }, [headingTarget, onConsumeHeadingTarget])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let observer: IntersectionObserver | null = null
    const timer = window.setTimeout(() => {
      const editor = container.querySelector('.zt-md-editor')
      const headings = Array.from(
        container.querySelectorAll<HTMLElement>(
          '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
        )
      )
      if (headings.length === 0) return

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          if (visible[0]) {
            const index = headings.indexOf(visible[0].target as HTMLElement)
            if (index >= 0) onActiveHeadingChange(index)
          }
        },
        {
          root: editor ?? null,
          rootMargin: '0px 0px -70% 0px',
          threshold: [0, 0.1, 0.2, 0.4]
        }
      )

      headings.forEach((heading) => observer?.observe(heading))
    }, 250)

    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [value, theme, onActiveHeadingChange])

  return (
    <div ref={containerRef} className="inkdown-editor-surface min-h-0 flex-1 overflow-hidden">
      <MilkdownEditor
        value={value}
        onChange={onChange}
        theme={theme}
        locale="zh-CN"
        placeholder="输入 Markdown..."
        maxHeight="100%"
        debounceMs={160}
        className="h-full"
        imageUpload={{ upload: handleUpload, maxFileSize: 10 * 1024 * 1024 }}
      />
    </div>
  )
}
