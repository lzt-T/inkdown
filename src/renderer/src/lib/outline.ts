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

/** Parses non-quoted Markdown headings into a flat document outline. */
export function parseOutline(markdown: string): OutlineItem[] {
  // Parsed tokens retain container nesting and source line mappings.
  const tokens = md.parse(markdown, {})
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
      line: line + 1
    })
  }

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

/** Counts visible words and CJK characters in Markdown source. */
export function countWords(markdown: string): number {
  // Formatting syntax is removed before language-specific counting.
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|=-]/g, ' ')

  // Latin tokens include contractions and numeric sequences.
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []
  // Each CJK ideograph counts as one readable unit.
  const cjkChars = text.match(/[\u3400-\u9fff]/g) ?? []
  return latinWords.length + cjkChars.length
}
