import MarkdownIt from 'markdown-it'

export interface OutlineItem {
  level: number
  text: string
  line: number
}

const md = new MarkdownIt({ html: false })

export function parseOutline(markdown: string): OutlineItem[] {
  const tokens = md.parse(markdown, {})
  const items: OutlineItem[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'heading_open') continue
    const level = Number(token.tag.slice(1))
    const inline = tokens[index + 1]
    const line = token.map?.[0] ?? 0
    items.push({
      level,
      text: inline?.content?.replace(/\s+/g, ' ').trim() || '',
      line: line + 1
    })
  }

  return items
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|=-]/g, ' ')

  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []
  const cjkChars = text.match(/[\u3400-\u9fff]/g) ?? []
  return latinWords.length + cjkChars.length
}
