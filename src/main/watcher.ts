import { basename, dirname, normalize, sep } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/contracts'

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function isHidden(target: string): boolean {
  return target.split(sep).some((part) => part.startsWith('.'))
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
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.workspaceChanged, path ? dirname(path) : resolved)
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
  if (watcher) {
    void watcher.close()
    watcher = null
  }
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
