import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  ImageStorageSettings,
  PersistedState,
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
// Default persisted state is merged with older state files during loading.
const defaultState: PersistedState = {
  recent: defaultRecent,
  theme: 'light',
  imageStorage: defaultImageStorage,
  windowBounds: null
}

function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...defaultState,
      ...parsed,
      recent: { ...defaultRecent, ...(parsed.recent ?? {}) },
      imageStorage: { ...defaultImageStorage, ...(parsed.imageStorage ?? {}) }
    }
  } catch {
    return structuredClone(defaultState)
  }
}

export async function updateState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const current = await loadState()
  const next: PersistedState = {
    ...current,
    ...patch,
    recent: { ...current.recent, ...(patch.recent ?? {}) },
    imageStorage: { ...current.imageStorage, ...(patch.imageStorage ?? {}) }
  }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(statePath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function addRecentWorkspace(workspace: string): Promise<RecentState> {
  const state = await loadState()
  const recent = {
    workspaces: [workspace, ...state.recent.workspaces.filter((item) => item !== workspace)].slice(0, 10),
    files: state.recent.files,
    lastWorkspace: workspace
  }
  await updateState({ recent })
  return recent
}

export async function addRecentFile(filePath: string): Promise<RecentState> {
  const state = await loadState()
  const recent = {
    ...state.recent,
    files: [filePath, ...state.recent.files.filter((item) => item !== filePath)].slice(0, 12)
  }
  await updateState({ recent })
  return recent
}

export async function setTheme(theme: ThemeMode): Promise<PersistedState> {
  return updateState({ theme })
}
