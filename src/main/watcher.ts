import { existsSync, type Stats } from 'fs'
import { basename, dirname, extname, normalize, relative } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, MARKDOWN_EXTENSIONS } from '../shared/contracts'

// 忽略常见依赖与构建产物目录，避免大工作区产生大量无效文件监听。
const IGNORED_DIRECTORY_NAMES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage'])

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let fileDebounceTimer: ReturnType<typeof setTimeout> | null = null
// 去抖窗口内保留全部受影响目录，避免快速事件彼此覆盖。
const pendingDirectories = new Map<string, string>()
// 去抖窗口内保留外部修改的具体文件路径，避免触发整个目录重扫。
const pendingChangedFiles = new Map<string, string>()
const internalWrites = new Map<string, number>()

function pathKey(target: string): string {
  return normalize(target).toLowerCase()
}

function isInternalWrite(target: string): boolean {
  const key = pathKey(target)
  const expiresAt = internalWrites.get(key)
  if (expiresAt === undefined) return false
  if (expiresAt === Number.POSITIVE_INFINITY || expiresAt > Date.now()) return true
  internalWrites.delete(key)
  return false
}

export function beginInternalWrite(filePath: string): void {
  internalWrites.set(pathKey(filePath), Number.POSITIVE_INFINITY)
}

export function endInternalWrite(filePath: string, succeeded: boolean): void {
  const key = pathKey(filePath)
  if (!succeeded) {
    internalWrites.delete(key)
    return
  }

  // Chokidar can report an atomic replacement shortly after fs.rename resolves.
  internalWrites.set(key, Date.now() + 1_000)
}

/** 基于相对工作区根路径判断隐藏目录、依赖目录与非 Markdown 文件是否应被忽略。 */
function shouldIgnorePath(target: string, root: string, stats?: Stats): boolean {
  const rel = relative(root, target)
  if (!rel) return false
  const segments = rel.split(/[\\/]/)
  if (segments.some((part) => part.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(part))) {
    return true
  }
  if (stats?.isFile()) {
    const ext = extname(target).slice(1).toLowerCase()
    return !MARKDOWN_EXTENSIONS.has(ext)
  }
  return false
}

/** 将已删除的刷新目标提升到最近仍存在的工作区目录。 */
function findExistingDirectory(directory: string, root: string): string | null {
  // 候选目录从文件事件直接影响的位置开始检查。
  let candidate = normalize(directory)
  // 工作区根路径限制向上查找的边界。
  const rootKey = pathKey(root)
  while (!existsSync(candidate)) {
    if (pathKey(candidate) === rootKey) return null
    // 父目录用于继续查找可安全扫描的位置。
    const parent = dirname(candidate)
    if (parent === candidate) return null
    candidate = parent
  }
  return candidate
}

export function startWorkspaceWatcher(root: string, window: BrowserWindow): void {
  stopWorkspaceWatcher()
  const resolved = normalize(root)

  watcher = chokidar.watch(resolved, {
    ignoreInitial: true,
    ignored: (path, stats) => shouldIgnorePath(path, resolved, stats),
    depth: 20,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 }
  })

  // 目录结构变更（新增或删除条目）去抖后通知渲染进程刷新对应父目录。
  const emitDirectoryChange = (path?: string): void => {
    if (path && isInternalWrite(path)) return
    // 文件事件刷新其父目录，无路径事件刷新工作区根目录。
    const directory = path ? dirname(path) : resolved
    pendingDirectories.set(pathKey(directory), directory)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      // 当前批次在发送前取出，后续事件可以进入新的去抖窗口。
      const directories = [...pendingDirectories.values()]
      pendingDirectories.clear()
      // 提升后的目录再次去重，删除子树事件最终只刷新同一个有效父目录。
      const refreshDirectories = new Map<string, string>()
      for (const directory of directories) {
        // 已存在目录确保渲染进程不会扫描已删除路径。
        const existingDirectory = findExistingDirectory(directory, resolved)
        if (existingDirectory) refreshDirectories.set(pathKey(existingDirectory), existingDirectory)
      }
      if (!window.isDestroyed()) {
        for (const directory of refreshDirectories.values()) {
          window.webContents.send(IPC_CHANNELS.workspaceChanged, directory)
        }
      }
    }, 150)
  }

  // 文件内容变更去抖后仅通知受影响的文件路径，避免触发目录重扫。
  const emitFileChange = (path: string): void => {
    if (isInternalWrite(path)) return
    pendingChangedFiles.set(pathKey(path), normalize(path))
    if (fileDebounceTimer) clearTimeout(fileDebounceTimer)
    fileDebounceTimer = setTimeout(() => {
      fileDebounceTimer = null
      const files = [...pendingChangedFiles.values()]
      pendingChangedFiles.clear()
      if (!window.isDestroyed()) {
        for (const filePath of files) {
          window.webContents.send(IPC_CHANNELS.fileChanged, filePath)
        }
      }
    }, 150)
  }

  watcher
    .on('add', emitDirectoryChange)
    .on('addDir', emitDirectoryChange)
    .on('unlink', emitDirectoryChange)
    .on('unlinkDir', emitDirectoryChange)
    .on('change', emitFileChange)
    .on('error', (error) => console.error('workspace watcher error', error))
}

export function stopWorkspaceWatcher(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  if (fileDebounceTimer) clearTimeout(fileDebounceTimer)
  fileDebounceTimer = null
  pendingDirectories.clear()
  pendingChangedFiles.clear()
  if (watcher) {
    void watcher.close()
    watcher = null
  }
  internalWrites.clear()
}

export function watchPathForConflict(filePath: string): string {
  return normalize(filePath)
}

export function isSamePath(left: string, right: string): boolean {
  return normalize(left).toLowerCase() === normalize(right).toLowerCase()
}

export function parentOf(filePath: string): string {
  return dirname(filePath)
}

export function pathName(filePath: string): string {
  return basename(filePath)
}
