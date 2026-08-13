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

export function dirname(value: string): string {
  const normalized = normalizeSlashes(value).replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return normalized.startsWith('/') ? '/' : ''
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
  return `inkdown-file://local?path=${encodeURIComponent(filePath)}`
}

export function parseInkdownUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.searchParams.get('path')
    return path ? decodeURIComponent(path) : null
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

function transformMarkdownImages(
  markdown: string,
  transform: (source: string) => string
): string {
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
    let depth = 0
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
    const whitespace = target.search(/\s/)
    const source = whitespace === -1 ? target.trim() : target.slice(0, whitespace).trim()
    const remainder = whitespace === -1 ? '' : target.slice(whitespace)
    const nextSource = transform(source)

    output += markdown.slice(imageStart, sourceStart) + nextSource + remainder + ')'
    cursor = sourceEnd + 1
  }

  return output
}

export function expandLocalImagePaths(markdown: string, documentPath: string): string {
  const documentDir = dirname(documentPath)
  return transformMarkdownImages(markdown, (source) => {
    if (isExternalUrl(source) || isFileUrl(source)) return source

    const decoded = decodeURIComponent(source.trim())
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
      return relativeFromDirectory(documentDir, absolute)
    }
    return pathToFileUrl(absolute)
  })
}
