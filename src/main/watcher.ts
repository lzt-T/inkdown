import { existsSync } from 'fs'
import { basename, dirname, normalize, sep } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/contracts'

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 去抖窗口内保留全部受影响目录，避免快速事件彼此覆盖。
const pendingDirectories = new Map<string, string>()
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

function isHidden(target: string): boolean {
  return target.split(sep).some((part) => part.startsWith('.'))
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
    ignored: (path, stats) => {
      if (stats?.isFile()) {
        const ext = path.split('.').pop()?.toLowerCase()
        return ext !== 'md' && ext !== 'markdown' && !isHidden(path)
      }
      return isHidden(path)
    },
    depth: 20,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 }
  })

  const emit = (path?: string): void => {
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

  watcher
    .on('add', emit)
    .on('addDir', emit)
    .on('unlink', emit)
    .on('unlinkDir', emit)
    .on('change', emit)
    .on('error', (error) => console.error('workspace watcher error', error))
}

export function stopWorkspaceWatcher(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  pendingDirectories.clear()
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
