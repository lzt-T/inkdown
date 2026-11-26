import { markdownParser, parseOutline, stripLeadingFrontmatter } from '@/lib/outline'
import type { EditorMode } from '../../../shared/contracts'

// 切换模式时对齐视口顶部的参考线像素偏移，避免紧贴边缘导致首行被遮挡。
export const SYNC_VIEWPORT_OFFSET = 24
// 视口位于极顶部或极底部时的吸附阈值（像素），保证首尾位置零偏差还原。
export const TOP_SNAP_THRESHOLD_PX = 2
export const BOTTOM_SNAP_THRESHOLD_PX = 2

// ProseMirror 内部注入的非内容占位节点类名，映射顶层块时必须剔除。
const PROSEMIRROR_IGNORED_CLASSES = [
  'ProseMirror-gapcursor',
  'ProseMirror-widget',
  'ProseMirror-separator',
  'ProseMirror-trailingBreak'
]

// 富文本中参与文档大纲与分段定位的标题选择器。
const HEADING_SELECTOR =
  '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'

/** 描述 Markdown 文档中的一个顶层块级节点及对应 1-based 行区间。 */
export interface MarkdownBlock {
  startLine: number
  endLine: number
  kind: 'frontmatter' | 'heading' | 'other'
}

/** 表示富文本与源码编辑器之间互通的规范化阅读位置锚点。 */
export interface ModeSyncAnchor {
  line: number
  lineProgress: number
  scrollRatio: number
}

/** 表示待目标编辑器消费的一次模式切换同步指令。 */
export interface ModeSyncTarget {
  docKey: string
  targetMode: EditorMode
  anchor: ModeSyncAnchor
  nonce: number
}

type ModePositionCaptureFn = () => ModeSyncAnchor | null

// 活动编辑器位置采集器注册表，键格式为 `${mode}:${docKey}`。
const modePositionCaptures = new Map<string, ModePositionCaptureFn>()

// 缓存最近一次顶层块解析结果，减少连续切换模式时的重复分词开销。
let lastBlocksMarkdown = ''
let lastParsedBlocks: MarkdownBlock[] = []

/** 将数值限制在闭区间 [min, max] 内。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 统计 Markdown 文本总行数（空文本按 1 行计）。 */
export function countLines(markdown: string): number {
  if (!markdown) return 1
  let lines = 1
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

/** 生成采集器注册表的复合键。 */
function getCaptureKey(mode: EditorMode, docKey: string): string {
  return `${mode}:${docKey}`
}

/** 为指定模式与文档注册位置采集器，并返回仅清理自身引用的注销函数。 */
export function registerModePositionCapture(
  mode: EditorMode,
  docKey: string,
  capture: ModePositionCaptureFn
): () => void {
  const key = getCaptureKey(mode, docKey)
  modePositionCaptures.set(key, capture)
  return () => {
    if (modePositionCaptures.get(key) === capture) {
      modePositionCaptures.delete(key)
    }
  }
}

/** 同步采集当前激活编辑器的视口位置锚点。 */
export function captureCurrentModePosition(
  mode: EditorMode,
  docKey: string
): ModeSyncAnchor | null {
  const capture = modePositionCaptures.get(getCaptureKey(mode, docKey))
  return capture ? capture() : null
}

/** 解析 Markdown 文档的顶层块及其 1-based 行号闭区间。 */
export function parseTopLevelBlocks(markdown: string): MarkdownBlock[] {
  if (markdown === lastBlocksMarkdown) return lastParsedBlocks
  if (!markdown) {
    lastBlocksMarkdown = ''
    lastParsedBlocks = []
    return lastParsedBlocks
  }

  const { body, lineOffset } = stripLeadingFrontmatter(markdown)
  const blocks: MarkdownBlock[] = []
  if (lineOffset > 0) {
    blocks.push({ startLine: 1, endLine: lineOffset, kind: 'frontmatter' })
  }

  if (body) {
    const tokens = markdownParser.parse(body, {})
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (token.level !== 0 || token.nesting < 0 || !token.map) continue
      const startLine = token.map[0] + lineOffset + 1
      const endLine = Math.max(startLine, token.map[1] + lineOffset)
      blocks.push({
        startLine,
        endLine,
        kind: token.type === 'heading_open' ? 'heading' : 'other'
      })
    }
  }

  lastBlocksMarkdown = markdown
  lastParsedBlocks = blocks
  return blocks
}

/** 返回富文本中属于文档大纲的标题元素（排除引用块内的标题）。 */
export function getOutlineHeadings(container: HTMLElement): HTMLElement[] {
  const headings = Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
  return headings.filter((heading) => !heading.closest('blockquote'))
}

/** 提取 ProseMirror 根容器下与 Markdown 顶层块一一对应的内容元素。 */
function getTopLevelDomBlocks(proseMirror: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = []
  const children = proseMirror.children
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (!(child instanceof HTMLElement)) continue
    if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
    const ignored = PROSEMIRROR_IGNORED_CLASSES.some((cls) => child.classList.contains(cls))
    if (!ignored) blocks.push(child)
  }
  return blocks
}

/** 获取元素相对于滚动容器内容顶部的上下边界。 */
function getElementScrollSpan(
  element: HTMLElement,
  scrollContainerTop: number,
  scrollTop: number
): { top: number; bottom: number; height: number } {
  const rect = element.getBoundingClientRect()
  const top = rect.top - scrollContainerTop + scrollTop
  const bottom = rect.bottom - scrollContainerTop + scrollTop
  return { top, bottom, height: Math.max(1, bottom - top) }
}

/** 将块内归一化进度转换为行号与行内进度，与反向换算保持严格对称。 */
function blockProgressToLineAnchor(
  block: MarkdownBlock,
  blockProgress: number,
  scrollRatio: number
): ModeSyncAnchor {
  const span = Math.max(1, block.endLine - block.startLine + 1)
  const offsetInBlock = clamp(blockProgress, 0, 0.9999) * span
  const lineOffset = Math.min(span - 1, Math.floor(offsetInBlock))
  return {
    line: block.startLine + lineOffset,
    lineProgress: clamp(offsetInBlock - lineOffset, 0, 0.999),
    scrollRatio
  }
}

/** 构建由文档起点、各标题与文档终点组成的分段锚点表。 */
function buildHeadingAnchors(
  container: HTMLElement,
  editor: HTMLElement,
  editorTop: number,
  markdown: string
): Array<{ line: number; contentY: number }> | null {
  const outline = parseOutline(markdown)
  const domHeadings = getOutlineHeadings(container)
  if (outline.length === 0 || domHeadings.length !== outline.length) return null

  const totalLines = countLines(markdown)
  const anchors: Array<{ line: number; contentY: number }> = [{ line: 1, contentY: 0 }]
  for (let index = 0; index < outline.length; index += 1) {
    const span = getElementScrollSpan(domHeadings[index], editorTop, editor.scrollTop)
    const prevContentY = anchors[anchors.length - 1].contentY
    anchors.push({
      line: outline[index].line,
      contentY: Math.max(prevContentY, span.top)
    })
  }
  const lastContentY = anchors[anchors.length - 1].contentY
  anchors.push({
    line: totalLines,
    contentY: Math.max(lastContentY, editor.scrollHeight)
  })
  return anchors
}

/** 从富文本编辑器当前可视区参考线采集规范化位置锚点。 */
export function captureWysiwygPosition(
  container: HTMLElement,
  markdown: string
): ModeSyncAnchor | null {
  const editor = container.querySelector<HTMLElement>('.zt-md-editor')
  const proseMirror = container.querySelector<HTMLElement>('.ProseMirror')
  if (!editor || !proseMirror || editor.clientHeight <= 0) return null

  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight)
  const scrollRatio = maxScroll > 0 ? clamp(editor.scrollTop / maxScroll, 0, 1) : 0
  const totalLines = countLines(markdown)

  if (editor.scrollTop <= TOP_SNAP_THRESHOLD_PX) {
    return { line: 1, lineProgress: 0, scrollRatio: 0 }
  }
  if (maxScroll > 0 && editor.scrollTop >= maxScroll - BOTTOM_SNAP_THRESHOLD_PX) {
    return { line: totalLines, lineProgress: 0.999, scrollRatio: 1 }
  }

  const editorTop = editor.getBoundingClientRect().top
  const referenceContentY = editor.scrollTop + SYNC_VIEWPORT_OFFSET
  const mdBlocks = parseTopLevelBlocks(markdown)
  const domBlocks = getTopLevelDomBlocks(proseMirror)

  // 第一级：Markdown 顶层块与 ProseMirror 顶层 DOM 块数量一致时做 1:1 精确映射。
  if (domBlocks.length > 0 && domBlocks.length === mdBlocks.length) {
    let prevSpan: { top: number; bottom: number; height: number } | null = null
    for (let index = 0; index < domBlocks.length; index += 1) {
      const span = getElementScrollSpan(domBlocks[index], editorTop, editor.scrollTop)
      if (referenceContentY < span.top) {
        if (index === 0 || !prevSpan) {
          return { line: 1, lineProgress: 0, scrollRatio }
        }
        const prevBlock = mdBlocks[index - 1]
        const nextBlock = mdBlocks[index]
        const gapSpanPx = Math.max(1, span.top - prevSpan.bottom)
        const gapRatio = clamp((referenceContentY - prevSpan.bottom) / gapSpanPx, 0, 0.9999)
        const gapLines = nextBlock.startLine - prevBlock.endLine - 1
        if (gapLines <= 0) {
          return { line: nextBlock.startLine, lineProgress: 0, scrollRatio }
        }
        const offsetInGap = gapRatio * gapLines
        const lineOffset = Math.min(gapLines - 1, Math.floor(offsetInGap))
        return {
          line: prevBlock.endLine + 1 + lineOffset,
          lineProgress: clamp(offsetInGap - lineOffset, 0, 0.999),
          scrollRatio
        }
      }
      if (referenceContentY <= span.bottom) {
        const blockProgress = (referenceContentY - span.top) / span.height
        return blockProgressToLineAnchor(mdBlocks[index], blockProgress, scrollRatio)
      }
      prevSpan = span
    }
    return {
      line: mdBlocks[mdBlocks.length - 1].endLine,
      lineProgress: 0.999,
      scrollRatio
    }
  }

  // 第二级：块数量因扩展语法不一致时，退化为基于大纲标题的分段线性插值。
  const headingAnchors = buildHeadingAnchors(container, editor, editorTop, markdown)
  if (headingAnchors) {
    for (let index = 0; index < headingAnchors.length - 1; index += 1) {
      const start = headingAnchors[index]
      const end = headingAnchors[index + 1]
      if (referenceContentY <= end.contentY || index === headingAnchors.length - 2) {
        const segmentHeight = Math.max(1, end.contentY - start.contentY)
        const ratio = clamp((referenceContentY - start.contentY) / segmentHeight, 0, 1)
        const lineFloat = clamp(start.line + ratio * Math.max(0, end.line - start.line), 1, totalLines)
        const line = Math.floor(lineFloat)
        return { line, lineProgress: clamp(lineFloat - line, 0, 0.999), scrollRatio }
      }
    }
  }

  // 第三级：无大纲标题或结构差异过大时使用整体滚动比例兜底。
  const lineFloat = 1 + scrollRatio * Math.max(0, totalLines - 1)
  const line = clamp(Math.floor(lineFloat), 1, totalLines)
  return { line, lineProgress: clamp(lineFloat - line, 0, 0.999), scrollRatio }
}

/** 将位置锚点应用到富文本滚动容器，尚未渲染出内容节点时返回 false 以便重试。 */
export function applyAnchorToWysiwyg(
  container: HTMLElement,
  markdown: string,
  anchor: ModeSyncAnchor
): boolean {
  const editor = container.querySelector<HTMLElement>('.zt-md-editor')
  const proseMirror = container.querySelector<HTMLElement>('.ProseMirror')
  if (!editor || !proseMirror || editor.clientHeight <= 0) return false

  const domBlocks = getTopLevelDomBlocks(proseMirror)
  if (markdown.trim().length > 0 && domBlocks.length === 0) return false

  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight)
  const totalLines = countLines(markdown)

  if (anchor.line <= 1 && anchor.lineProgress <= 0 && anchor.scrollRatio <= 0.001) {
    editor.scrollTop = 0
    return true
  }
  if (anchor.scrollRatio >= 0.999 && anchor.line >= totalLines) {
    editor.scrollTop = maxScroll
    return true
  }

  const editorTop = editor.getBoundingClientRect().top
  const mdBlocks = parseTopLevelBlocks(markdown)

  // 第一级：块数量一致时按行号还原块内或块间空行对应的内容纵坐标。
  if (domBlocks.length > 0 && domBlocks.length === mdBlocks.length) {
    if (anchor.line < mdBlocks[0].startLine) {
      editor.scrollTop = 0
      return true
    }

    for (let index = 0; index < mdBlocks.length; index += 1) {
      const block = mdBlocks[index]
      if (anchor.line > block.endLine) continue

      const span = getElementScrollSpan(domBlocks[index], editorTop, editor.scrollTop)
      if (anchor.line >= block.startLine) {
        const blockLines = Math.max(1, block.endLine - block.startLine + 1)
        const blockProgress = clamp(
          (anchor.line - block.startLine + anchor.lineProgress) / blockLines,
          0,
          1
        )
        const targetContentY = span.top + blockProgress * span.height
        editor.scrollTop = clamp(targetContentY - SYNC_VIEWPORT_OFFSET, 0, maxScroll)
        return true
      }

      if (index > 0) {
        const prevBlock = mdBlocks[index - 1]
        const prevSpan = getElementScrollSpan(domBlocks[index - 1], editorTop, editor.scrollTop)
        const gapLines = Math.max(1, block.startLine - prevBlock.endLine - 1)
        const gapProgress = clamp(
          (anchor.line - prevBlock.endLine - 1 + anchor.lineProgress) / gapLines,
          0,
          1
        )
        const targetContentY =
          prevSpan.bottom + gapProgress * Math.max(0, span.top - prevSpan.bottom)
        editor.scrollTop = clamp(targetContentY - SYNC_VIEWPORT_OFFSET, 0, maxScroll)
        return true
      }
    }

    const lastSpan = getElementScrollSpan(domBlocks[domBlocks.length - 1], editorTop, editor.scrollTop)
    editor.scrollTop = clamp(lastSpan.bottom - SYNC_VIEWPORT_OFFSET, 0, maxScroll)
    return true
  }

  // 第二级：退化为基于标题的分段锚点插值。
  const headingAnchors = buildHeadingAnchors(container, editor, editorTop, markdown)
  if (headingAnchors) {
    const targetLine = clamp(anchor.line + anchor.lineProgress, 1, totalLines)
    for (let index = 0; index < headingAnchors.length - 1; index += 1) {
      const start = headingAnchors[index]
      const end = headingAnchors[index + 1]
      if (targetLine <= end.line || index === headingAnchors.length - 2) {
        const lineSpan = Math.max(1, end.line - start.line)
        const ratio = clamp((targetLine - start.line) / lineSpan, 0, 1)
        const targetContentY = start.contentY + ratio * Math.max(0, end.contentY - start.contentY)
        editor.scrollTop = clamp(targetContentY - SYNC_VIEWPORT_OFFSET, 0, maxScroll)
        return true
      }
    }
  }

  // 第三级：整体滚动比例兜底。
  editor.scrollTop = clamp(anchor.scrollRatio * maxScroll, 0, maxScroll)
  return true
}
