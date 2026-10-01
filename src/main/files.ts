import { t } from './i18n'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
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

/** 在原文件上写入，避免 Windows 因禁止替换文件而拒绝保存。 */
async function writeFileInPlace(filePath: string, payload: string): Promise<void> {
  // 只有目标不存在时才创建文件，权限等其他打开错误直接上抛。
  const handle = await fs.open(filePath, 'r+').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return fs.open(filePath, 'w')
  })
  try {
    await handle.writeFile(payload, 'utf8')
    await handle.truncate(Buffer.byteLength(payload, 'utf8'))
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** 将完整内容同步到同目录临时文件，再原子替换目标。 */
async function writeFileAtomically(filePath: string, payload: string): Promise<void> {
  // 唯一名称配合排他创建，避免覆盖其他保存操作的临时文件。
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)
  // 创建成功后才进入清理流程，避免误删不属于本次保存的文件。
  const handle = await fs.open(tempPath, 'wx')
  try {
    try {
      await handle.writeFile(payload, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(tempPath, filePath)
  } finally {
    // 替换成功后临时路径已消失；清理失败不得覆盖保存结果。
    await fs.unlink(tempPath).catch(() => {})
  }
}

// Windows 优先兼容原地写入，其他平台保留原子替换。
const FILE_WRITE_STRATEGIES: Partial<Record<NodeJS.Platform, typeof writeFileInPlace>> = {
  win32: writeFileInPlace,
  darwin: writeFileAtomically,
  linux: writeFileAtomically
}

/** 保留文档换行和 BOM，并按平台选择保存方式。 */
export async function writeMarkdown(
  filePath: string,
  content: string,
  newline: '\r\n' | '\n' = '\n',
  hasBom = false
): Promise<void> {
  // 统一保存路径，供平台写入策略使用。
  const resolved = resolve(filePath)
  // 使用文档原有换行格式生成本次保存内容。
  const normalized = newline === '\r\n' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n')
  // BOM 与正文作为同一份内容写入。
  const payload = (hasBom ? '\uFEFF' : '') + normalized
  await (FILE_WRITE_STRATEGIES[process.platform] ?? writeFileAtomically)(resolved, payload)
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

/** 将图片写入授权目录，并使用当前语言反馈应用级错误。 */
export async function importImage(input: {
  name: string
  data: Uint8Array
  targetDir: string
  documentDir: string
  storageMode: 'relative' | 'global'
}): Promise<ImportImageResult> {
  const targetDir = resolve(input.targetDir)
  if (!isAuthorized(targetDir)) throw new Error(t('native.target-directory-is-not-authorized'))
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

/** 在授权目录创建不覆盖已有名称的 Markdown 文件。 */
export async function createMarkdownFile(directory: string, name: string): Promise<FileNode> {
  const resolved = resolve(directory)
  if (!isAuthorized(resolved)) throw new Error(t('native.directory-is-not-authorized'))
  const fileName = name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown') ? name : `${name}.md`
  const filePath = await uniquePath(resolved, fileName)
  await fs.writeFile(filePath, '', 'utf8')
  return { name: basename(filePath), path: filePath, type: 'file' }
}

/** 创建授权范围内的新文件夹。 */
export async function createFolder(directory: string, name: string): Promise<FileNode> {
  const resolved = resolve(directory)
  if (!isAuthorized(resolved)) throw new Error(t('native.directory-is-not-authorized'))
  const folderPath = await uniquePath(resolved, sanitizeFileName(name))
  await fs.mkdir(folderPath, { recursive: true })
  return { name: basename(folderPath), path: folderPath, type: 'directory' }
}

/** 重命名授权路径，并返回更新后的文件节点。 */
export async function renameEntry(oldPath: string, newName: string): Promise<FileNode> {
  const resolvedOld = resolve(oldPath)
  if (!isAuthorized(resolvedOld)) throw new Error(t('native.path-is-not-authorized'))
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

/** 将授权范围内的路径移至系统回收站。 */
export async function trashEntry(target: string): Promise<void> {
  const resolved = resolve(target)
  if (!isAuthorized(resolved)) throw new Error(t('native.path-is-not-authorized'))
  await shell.trashItem(resolved)
}

export async function revealEntry(target: string): Promise<void> {
  const resolved = resolve(target)
  shell.showItemInFolder(resolved)
}

