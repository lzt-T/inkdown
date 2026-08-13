export type ThemeMode = 'light' | 'dark'
export type EditorMode = 'wysiwyg' | 'source'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface OpenFileData {
  path: string
  name: string
  content: string
  newline: '\r\n' | '\n'
  hasBom: boolean
}

export interface WriteFileRequest {
  path: string
  content: string
  newline: '\r\n' | '\n'
  hasBom: boolean
}

export interface SaveFileResult {
  path: string
  name: string
  savedAt: number
}

export interface ImportImageRequest {
  name: string
  data: Uint8Array
  targetDir: string
}

export interface ImportImageResult {
  src: string
  fileName: string
  relativePath: string | null
}

export interface RecentState {
  workspaces: string[]
  files: string[]
  lastWorkspace: string | null
}

export interface PersistedState {
  recent: RecentState
  theme: ThemeMode
  windowBounds: { width: number; height: number; x?: number; y?: number } | null
}

export type MenuAction =
  | 'open-workspace'
  | 'open-file'
  | 'new-file'
  | 'save'
  | 'save-as'
  | 'close-tab'
  | 'toggle-sidebar'
  | 'toggle-outline'
  | 'toggle-source'
  | 'toggle-theme'

export const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

export const IPC_CHANNELS = {
  workspaceOpen: 'workspace:open',
  workspaceOpenPath: 'workspace:open-path',
  workspaceScan: 'workspace:scan',
  workspaceChanged: 'workspace:changed',
  fileOpen: 'file:open',
  fileOpenPath: 'file:open-path',
  fileRead: 'file:read',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileCreate: 'file:create',
  fileCreateFolder: 'file:create-folder',
  fileRename: 'file:rename',
  fileTrash: 'file:trash',
  fileReveal: 'file:reveal',
  fileChanged: 'file:changed',
  imageImport: 'image:import',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  menuAction: 'menu:action',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  dirtyCountChanged: 'app:dirty-count-changed'
} as const



