function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function basename(value: string): string {
  const parts = normalizeSlashes(value).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** 获取父目录，并保留盘符根目录的绝对路径形式。 */
export function dirname(value: string): string {
  // 标准化分隔符以兼容系统路径与 Markdown 路径。
  const normalized = normalizeSlashes(value).replace(/\/+$/, '')
  // 最后一个分隔符决定父目录边界。
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return normalized.startsWith('/') ? '/' : ''
  if (index === 2 && /^[a-zA-Z]:\//.test(normalized)) return normalized.slice(0, 3)
  return normalized.slice(0, index)
}

export function extname(value: string): string {
  const name = basename(value)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

export function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')
}

export function isInsideDir(directory: string, target: string): boolean {
  const left = trimTrailingSlash(normalizeSlashes(directory)).toLowerCase()
  const right = trimTrailingSlash(normalizeSlashes(target)).toLowerCase()
  return right === left || right.startsWith(`${left}/`)
}

/** 若目标路径位于旧前缀自身或子路径下，则替换为新前缀并保留新前缀分隔符。 */
export function replacePathPrefix(
  targetPath: string,
  oldPrefix: string,
  newPrefix: string
): string | null {
  const normalizedTarget = trimTrailingSlash(normalizeSlashes(targetPath))
  const normalizedOld = trimTrailingSlash(normalizeSlashes(oldPrefix))
  const lowerTarget = normalizedTarget.toLowerCase()
  const lowerOld = normalizedOld.toLowerCase()
  const cleanNewPrefix = newPrefix.replace(/[\\/]+$/, '')

  if (lowerTarget === lowerOld) return cleanNewPrefix
  if (!lowerTarget.startsWith(`${lowerOld}/`)) return null

  const suffix = normalizedTarget.slice(normalizedOld.length + 1)
  const separator = newPrefix.includes('\\') && !newPrefix.includes('/') ? '\\' : '/'
  return `${cleanNewPrefix}${separator}${suffix.replace(/\//g, separator)}`
}

export function resolveRelative(baseDirectory: string, relativePath: string): string {
  const base = normalizeSlashes(baseDirectory)
  const relative = normalizeSlashes(relativePath)
  if (isAbsolutePath(relative)) return relative.replace(/^\/+/, '')
  const stack = base.split('/').filter(Boolean)
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  const resolved = stack.join('/')
  return /^[a-zA-Z]:/.test(resolved) ? resolved : `/${resolved}`
}

export function relativeFromDirectory(directory: string, target: string): string {
  const left = trimTrailingSlash(normalizeSlashes(directory)).toLowerCase()
  const right = trimTrailingSlash(normalizeSlashes(target)).toLowerCase()
  if (isInsideDir(left, right)) {
    return normalizeSlashes(target).slice(left.length).replace(/^\/+/, '')
  }
  return normalizeSlashes(target)
}

export function buildInkdownUrl(filePath: string): string {
  // encodeURIComponent 不会编码括号，额外转义避免破坏 Markdown 图片语法定界符。
  const encoded = encodeURIComponent(filePath).replace(/[()]/g, (char) =>
    char === '(' ? '%28' : '%29'
  )
  return `inkdown-file://local?path=${encoded}`
}

export function parseInkdownUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('path') || null
  } catch {
    return null
  }
}

export function fileUrlToPath(url: string): string | null {
  try {
    if (!url.startsWith('file:')) return null
    const parsed = new URL(url)
    return decodeURIComponent(parsed.pathname).replace(/^\//, '')
  } catch {
    return null
  }
}

export function pathToFileUrl(filePath: string): string {
  const normalized = normalizeSlashes(filePath)
  return `file:///${encodeURI(normalized).replace(/%5C/g, '/')}`
}

export function isExternalUrl(value: string): boolean {
  return /^(https?:|data:|inkdown-file:|mailto:|#)/i.test(value.trim())
}

export function isFileUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith('file:')
}

// 匹配 Markdown 图片语法末尾的合法 title（双引号、单引号或括号包裹）。
const MARKDOWN_IMAGE_TITLE_SUFFIX =
  /(\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))$/

/** 安全解码 URI 组件，遇到非法百分号序列时保留原值。 */
function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 对写入 Markdown 图片语法的相对路径编码空白、括号等特殊字符，保留中文等常规字符可读性。 */
function encodeMarkdownRelativePath(relativePath: string): string {
  return normalizeSlashes(relativePath).replace(/[\s()%<>]/g, (char) => {
    const code = char.charCodeAt(0)
    return code < 0x80
      ? `%${code.toString(16).toUpperCase().padStart(2, '0')}`
      : encodeURIComponent(char)
  })
}

/** 拆分 Markdown 图片括号内的目标路径与可选 title，兼容尖括号包裹和含裸空格的历史路径。 */
function splitImageTarget(target: string): {
  source: string
  remainder: string
  bracketed: boolean
} {
  const trimmed = target.trim()
  if (!trimmed) return { source: '', remainder: '', bracketed: false }

  if (trimmed.startsWith('<')) {
    for (let index = 1; index < trimmed.length; index += 1) {
      const char = trimmed[index]
      if (char === '\n' || char === '\r') break
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === '>') {
        return {
          source: trimmed.slice(1, index),
          remainder: trimmed.slice(index + 1),
          bracketed: true
        }
      }
    }
  }

  const match = MARKDOWN_IMAGE_TITLE_SUFFIX.exec(trimmed)
  if (match) {
    const source = trimmed.slice(0, match.index).trim()
    if (source) {
      return { source, remainder: match[1], bracketed: false }
    }
  }

  return { source: trimmed, remainder: '', bracketed: false }
}

/** 按括号平衡扫描并转换 Markdown 图片路径，无图片标记时直接短路返回。 */
function transformMarkdownImages(
  markdown: string,
  transform: (source: string) => string
): string {
  if (!markdown.includes('![')) return markdown
  let output = ''
  let cursor = 0

  while (cursor < markdown.length) {
    const imageStart = markdown.indexOf('![', cursor)
    if (imageStart === -1) {
      output += markdown.slice(cursor)
      break
    }

    output += markdown.slice(cursor, imageStart)
    const altEnd = markdown.indexOf(']', imageStart + 2)
    if (altEnd === -1 || markdown[altEnd + 1] !== '(') {
      output += markdown.slice(imageStart, imageStart + 1)
      cursor = imageStart + 1
      continue
    }

    const sourceStart = altEnd + 2
    // sourceStart 已跳过开括号 (，初始嵌套深度为 1。
    let depth = 1
    let sourceEnd = sourceStart
    for (let index = sourceStart; index < markdown.length; index += 1) {
      const char = markdown[index]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) {
          sourceEnd = index
          break
        }
      }
    }

    if (sourceEnd === sourceStart) {
      output += markdown.slice(imageStart, imageStart + 1)
      cursor = imageStart + 1
      continue
    }

    const target = markdown.slice(sourceStart, sourceEnd)
    const { source, remainder, bracketed } = splitImageTarget(target)
    if (!source) {
      output += markdown.slice(imageStart, sourceEnd + 1)
      cursor = sourceEnd + 1
      continue
    }

    const nextSource = transform(source)
    const formattedSource = bracketed && nextSource === source ? `<${nextSource}>` : nextSource

    output += markdown.slice(imageStart, sourceStart) + formattedSource + remainder + ')'
    cursor = sourceEnd + 1
  }

  return output
}

export function expandLocalImagePaths(markdown: string, documentPath: string): string {
  const documentDir = dirname(documentPath)
  return transformMarkdownImages(markdown, (source) => {
    if (isExternalUrl(source) || isFileUrl(source)) return source

    const decoded = safeDecodeUriComponent(source.trim())
    const absolute = isAbsolutePath(decoded)
      ? normalizeSlashes(decoded)
      : resolveRelative(documentDir, decoded)
    return buildInkdownUrl(absolute)
  })
}

export function collapseInkdownImagePaths(markdown: string, documentPath: string): string {
  const documentDir = dirname(documentPath)
  return transformMarkdownImages(markdown, (source) => {
    if (!source.startsWith('inkdown-file:')) return source

    const absolute = parseInkdownUrl(source)
    if (!absolute) return source
    if (isInsideDir(documentDir, absolute)) {
      return encodeMarkdownRelativePath(relativeFromDirectory(documentDir, absolute))
    }
    return pathToFileUrl(absolute)
  })
}
