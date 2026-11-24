import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  ImageStorageSettings,
  PersistedState,
  ProxySettings,
  RecentState,
  ThemeMode
} from '../shared/contracts'

const defaultRecent: RecentState = { workspaces: [], files: [], lastWorkspace: null }
// Default image storage preserves the existing document-relative behavior.
const defaultImageStorage: ImageStorageSettings = {
  mode: 'relative',
  relativeDirectory: 'assets',
  globalDirectory: null,
  github: null
}
// Default proxy behavior follows the operating system without manual overrides.
const defaultProxy: ProxySettings = {
  mode: 'system',
  server: ''
}
// Default persisted state is merged with older state files during loading.
const defaultState: PersistedState = {
  language: 'system',
  recent: defaultRecent,
  theme: 'light',
  imageStorage: defaultImageStorage,
  proxy: defaultProxy,
  windowBounds: null
}

// 内存缓存避免启动阶段与高频保存时重复读取和解析 state.json。
let cachedState: PersistedState | null = null
// 标记用户数据目录已创建，跳过后续重复 mkdir 系统调用。
let userDataDirReady = false
// 串行化状态写入，防止并发更新相互覆盖。
let stateWriteQueue: Promise<unknown> = Promise.resolve()

function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

/** 读取并缓存持久化状态，返回深拷贝以免外部修改污染缓存。 */
export async function loadState(): Promise<PersistedState> {
  if (cachedState) return structuredClone(cachedState)
  try {
    const raw = await fs.readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    cachedState = {
      ...defaultState,
      ...parsed,
      recent: { ...defaultRecent, ...(parsed.recent ?? {}) },
      imageStorage: { ...defaultImageStorage, ...(parsed.imageStorage ?? {}) },
      // Explicit fields discard legacy proxy options that are no longer supported.
      proxy: {
        mode: parsed.proxy?.mode ?? defaultProxy.mode,
        server: parsed.proxy?.server ?? defaultProxy.server
      }
    }
  } catch {
    cachedState = structuredClone(defaultState)
  }
  return structuredClone(cachedState)
}

/** 串行合并并持久化状态补丁，同时刷新内存缓存。 */
export function updateState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const write = stateWriteQueue.catch(() => undefined).then(async () => {
    const current = await loadState()
    const next: PersistedState = {
      ...current,
      ...patch,
      recent: { ...current.recent, ...(patch.recent ?? {}) },
      imageStorage: { ...current.imageStorage, ...(patch.imageStorage ?? {}) },
      proxy: { ...current.proxy, ...(patch.proxy ?? {}) }
    }
    if (!userDataDirReady) {
      await fs.mkdir(app.getPath('userData'), { recursive: true })
      userDataDirReady = true
    }
    await fs.writeFile(statePath(), JSON.stringify(next, null, 2), 'utf8')
    cachedState = structuredClone(next)
    return next
  })
  stateWriteQueue = write
  return write
}

/** 记录最近工作区，若已在首位则跳过无效写盘。 */
export async function addRecentWorkspace(
  workspace: string
): Promise<{ recent: RecentState; changed: boolean }> {
  const state = await loadState()
  if (state.recent.workspaces[0] === workspace && state.recent.lastWorkspace === workspace) {
    return { recent: state.recent, changed: false }
  }
  const recent = {
    workspaces: [workspace, ...state.recent.workspaces.filter((item) => item !== workspace)].slice(0, 10),
    files: state.recent.files,
    lastWorkspace: workspace
  }
  await updateState({ recent })
  return { recent, changed: true }
}

/** 记录最近文件，若已在首位则跳过无效写盘与广播。 */
export async function addRecentFile(
  filePath: string
): Promise<{ recent: RecentState; changed: boolean }> {
  const state = await loadState()
  if (state.recent.files[0] === filePath) {
    return { recent: state.recent, changed: false }
  }
  const recent = {
    ...state.recent,
    files: [filePath, ...state.recent.files.filter((item) => item !== filePath)].slice(0, 12)
  }
  await updateState({ recent })
  return { recent, changed: true }
}

export async function setTheme(theme: ThemeMode): Promise<PersistedState> {
  return updateState({ theme })
}
