import { promises as fs } from 'fs'
import { basename, dirname, extname, join, relative, resolve } from 'path'
import { shell } from 'electron'
import { isAuthorized, isInside } from './security'
import { MARKDOWN_EXTENSIONS, type FileNode, type ImportImageResult, type OpenFileData } from '../shared/contracts'


function sortedName(a: string, b: string): number {
  return a.localeCompare(b, 'zh-CN', { sensitivity: 'base', numeric: true })
}

export async function scanDir(directory: string): Promise<FileNode[]> {
  const resolved = resolve(directory)
  const entries = await fs.readdir(resolved, { withFileTypes: true })
  const directories: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    const entryPath = join(resolved, entry.name)
    if (entry.name.startsWith('.')) continue

    if (entry.isDirectory()) {
      directories.push({ name: entry.name, path: entryPath, type: 'directory' })
    } else if (entry.isFile()) {
      const ext = extname(entry.name).slice(1).toLowerCase()
      if (MARKDOWN_EXTENSIONS.has(ext)) {
        files.push({ name: entry.name, path: entryPath, type: 'file' })
      }
    }
  }

  return [
    ...directories.sort((a, b) => sortedName(a.name, b.name)),
    ...files.sort((a, b) => sortedName(a.name, b.name))
  ]
}

function detectNewline(content: string): '\r\n' | '\n' {
  const crlf = (content.match(/\r\n/g) ?? []).length
  const lf = (content.match(/(?<!\r)\n/g) ?? []).length
  return crlf > lf ? '\r\n' : '\n'
}

export async function readMarkdown(filePath: string): Promise<OpenFileData> {
  const resolved = resolve(filePath)
  const buffer = await fs.readFile(resolved)
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const content = buffer.toString('utf8').replace(/^\uFEFF/, '')
  return {
    path: resolved,
    name: basename(resolved),
    content,
    newline: detectNewline(content),
    hasBom
  }
}

export async function writeMarkdown(
  filePath: string,
  content: string,
  newline: '\r\n' | '\n' = '\n',
  hasBom = false
): Promise<void> {
  const resolved = resolve(filePath)
  const normalized = newline === '\r\n' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n')
  const payload = (hasBom ? '\uFEFF' : '') + normalized
  const tempPath = join(dirname(resolved), `.${basename(resolved)}.${Date.now()}.tmp`)
  await fs.writeFile(tempPath, payload, 'utf8')
  await fs.rename(tempPath, resolved)
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim()
  return cleaned || 'image'
}

async function uniquePath(directory: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = join(directory, name)
  let index = 1
  while (true) {
    try {
      await fs.access(candidate)
      candidate = join(directory, `${stem} ${index}${ext}`)
      index += 1
    } catch {
      return candidate
    }
  }
}

export function fileToInkdownUrl(filePath: string): string {
  return `inkdown-file://local?path=${encodeURIComponent(resolve(filePath))}`
}

export function inkdownUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.searchParams.get('path')
    return path ? resolve(decodeURIComponent(path)) : null
  } catch {
    return null
  }
}

export async function importImage(input: {
  name: string
  data: Uint8Array
  targetDir: string
  documentDir: string
  storageMode: 'relative' | 'global'
}): Promise<ImportImageResult> {
  const targetDir = resolve(input.targetDir)
  if (!isAuthorized(targetDir)) throw new Error('目标目录不在授权范围内')
  await fs.mkdir(targetDir, { recursive: true })

  const fileName = sanitizeFileName(input.name)
  const destination = await uniquePath(targetDir, fileName)
  await fs.writeFile(destination, Buffer.from(input.data))
  // Relative path is available only when the image lives inside the document directory.
  const relativePath = isInside(input.documentDir, destination)
    ? relative(resolve(input.documentDir), destination).replace(/\\/g, '/')
    : null

  return {
    src: fileToInkdownUrl(destination),
    fileName: basename(destination),
    relativePath,
    storageMode: input.storageMode
  }
}

export async function createMarkdownFile(directory: string, name: string): Promise<FileNode> {
  const resolved = resolve(directory)
  if (!isAuthorized(resolved)) throw new Error('目录不在授权范围内')
  const fileName = name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown') ? name : `${name}.md`
  const filePath = await uniquePath(resolved, fileName)
  await fs.writeFile(filePath, '', 'utf8')
  return { name: basename(filePath), path: filePath, type: 'file' }
}

export async function createFolder(directory: string, name: string): Promise<FileNode> {
  const resolved = resolve(directory)
  if (!isAuthorized(resolved)) throw new Error('目录不在授权范围内')
  const folderPath = await uniquePath(resolved, sanitizeFileName(name))
  await fs.mkdir(folderPath, { recursive: true })
  return { name: basename(folderPath), path: folderPath, type: 'directory' }
}

export async function renameEntry(oldPath: string, newName: string): Promise<FileNode> {
  const resolvedOld = resolve(oldPath)
  if (!isAuthorized(resolvedOld)) throw new Error('路径不在授权范围内')
  const cleanName = sanitizeFileName(newName)
  const parent = dirname(resolvedOld)
  const newPath = join(parent, cleanName)
  await fs.rename(resolvedOld, newPath)
  const stat = await fs.stat(newPath)
  return {
    name: basename(newPath),
    path: newPath,
    type: stat.isDirectory() ? 'directory' : 'file'
  }
}

export async function trashEntry(target: string): Promise<void> {
  const resolved = resolve(target)
  if (!isAuthorized(resolved)) throw new Error('路径不在授权范围内')
  await shell.trashItem(resolved)
}

export async function revealEntry(target: string): Promise<void> {
  const resolved = resolve(target)
  shell.showItemInFolder(resolved)
}

