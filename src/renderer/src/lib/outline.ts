import MarkdownIt from 'markdown-it'

export interface OutlineItem {
  level: number
  text: string
  line: number
}

export interface OutlineTreeNode extends OutlineItem {
  index: number
  children: OutlineTreeNode[]
}

// Markdown parser provides source-aware heading and blockquote tokens.
const md = new MarkdownIt({ html: false })
// 匹配位于文档开头的 YAML（---）或 TOML（+++）Frontmatter 块。
const LEADING_FRONTMATTER_REGEX = /^(-{3,}|\+{3,})[ \t]*\r?\n(?:[\s\S]*?\r?\n)?\1[ \t]*(?:\r?\n|$)/

/** 剥离文档头部 Frontmatter 并返回剩余正文与起始行偏移。 */
function stripLeadingFrontmatter(markdown: string): { body: string; lineOffset: number } {
  const match = LEADING_FRONTMATTER_REGEX.exec(markdown)
  if (!match) {
    return { body: markdown, lineOffset: 0 }
  }

  // 统计被剥离元数据块占用的换行数，以保持源码大纲行号准确。
  const header = match[0]
  const lineOffset = header.match(/\n/g)?.length ?? 0
  return {
    body: markdown.slice(header.length),
    lineOffset
  }
}

// 缓存最近一次大纲解析结果，避免多处消费同一文档时重复执行 markdown-it 解析。
let lastParsedMarkdown = ''
let lastParsedOutline: OutlineItem[] = []

/** Parses non-quoted Markdown headings into a flat document outline. */
export function parseOutline(markdown: string): OutlineItem[] {
  if (markdown === lastParsedMarkdown) return lastParsedOutline
  if (!markdown) {
    lastParsedMarkdown = ''
    lastParsedOutline = []
    return lastParsedOutline
  }

  const { body, lineOffset } = stripLeadingFrontmatter(markdown)
  // Parsed tokens retain container nesting and source line mappings.
  const tokens = md.parse(body, {})
  // Outline items exclude headings nested inside blockquotes.
  const items: OutlineItem[] = []
  // Blockquote depth tracks both ordinary and nested quote containers.
  let blockquoteDepth = 0

  for (let index = 0; index < tokens.length; index += 1) {
    // Current token determines container depth or heading content.
    const token = tokens[index]
    if (token.type === 'blockquote_open') {
      blockquoteDepth += 1
      continue
    }
    if (token.type === 'blockquote_close') {
      blockquoteDepth -= 1
      continue
    }
    if (blockquoteDepth > 0 || token.type !== 'heading_open') continue

    // Heading level mirrors the Markdown H1-H6 tag.
    const level = Number(token.tag.slice(1))
    // Adjacent inline token contains the display text.
    const inline = tokens[index + 1]
    // Markdown-It exposes zero-based source line mappings.
    const line = token.map?.[0] ?? 0
    items.push({
      level,
      text: inline?.content?.replace(/\s+/g, ' ').trim() || '',
      line: line + lineOffset + 1
    })
  }

  lastParsedMarkdown = markdown
  lastParsedOutline = items
  return items
}

/** Builds a collapsible tree while preserving each heading's flat index. */
export function buildOutlineTree(items: OutlineItem[]): OutlineTreeNode[] {
  // Root nodes have no preceding heading at a higher semantic level.
  const roots: OutlineTreeNode[] = []
  // Stack holds the current ancestor path.
  const stack: OutlineTreeNode[] = []

  items.forEach((item, index) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }

    // Tree node retains the filtered flat index used by editor navigation.
    const node: OutlineTreeNode = { ...item, index, children: [] }
    // Nearest lower-level heading becomes the parent when present.
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  })

  return roots
}

/** 判断字符编码是否为拉丁字母或数字。 */
function isAsciiWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

/** 单遍扫描统计 Markdown 正文中的英文词数与中日韩字符数，避免分配中间数组。 */
export function countWords(markdown: string): number {
  if (!markdown) return 0
  let { body } = stripLeadingFrontmatter(markdown)
  if (!body) return 0

  // 仅当文本包含对应语法标记时才剥离代码块、行内代码与链接语法。
  if (body.includes('```')) body = body.replace(/```[\s\S]*?```/g, ' ')
  if (body.includes('`')) body = body.replace(/`[^`]*`/g, ' ')
  if (body.includes('![')) body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  if (body.includes('[')) body = body.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  let count = 0
  let inLatinWord = false
  for (let index = 0; index < body.length; index += 1) {
    const code = body.charCodeAt(index)
    if (code >= 0x3400 && code <= 0x9fff) {
      count += 1
      inLatinWord = false
      continue
    }
    if (isAsciiWordChar(code)) {
      if (!inLatinWord) {
        count += 1
        inLatinWord = true
      }
      continue
    }
    // 保留英文单词内部缩写撇号（直引号与弯引号），其余标点（含 -）均作为词边界。
    if (inLatinWord && (code === 39 || code === 0x2019) && isAsciiWordChar(body.charCodeAt(index + 1))) {
      continue
    }
    inLatinWord = false
  }
  return count
}
