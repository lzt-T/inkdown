export type ThemeMode = 'light' | 'dark'
export type EditorMode = 'wysiwyg' | 'source'
export type ImageStorageMode = 'relative' | 'global' | 'github'
export type ProxyMode = 'system' | 'direct' | 'manual'

/** Defines the application-wide proxy behavior persisted on this device. */
export interface ProxySettings {
  mode: ProxyMode
  server: string
}

export interface GitHubImageStorageSettings {
  owner: string
  repository: string
  branch: string
}

export interface ImageStorageSettings {
  mode: ImageStorageMode
  relativeDirectory: string
  globalDirectory: string | null
  github: GitHubImageStorageSettings | null
}

export interface GitHubImageStorageStatus {
  settings: GitHubImageStorageSettings | null
  hasToken: boolean
}

export interface ConfigureGitHubImageStorageRequest {
  repository: string
  token: string | null
}

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
  documentPath: string | null
  mimeType: string
}

export interface ImportImageResult {
  src: string
  fileName: string
  relativePath: string | null
  storageMode: ImageStorageMode | 'embedded'
  fallbackReason?: 'unsaved-document' | 'local-import-failed'
  fallbackDescription?: string
}

export interface RecentState {
  workspaces: string[]
  files: string[]
  lastWorkspace: string | null
}

export interface PersistedState {
  recent: RecentState
  theme: ThemeMode
  imageStorage: ImageStorageSettings
  proxy: ProxySettings
  windowBounds: { width: number; height: number; x?: number; y?: number } | null
}

export interface AppUpdateState {
  version: string
  action: 'download' | 'install'
}

export interface AppUpdateDownloadProgress {
  version: string
  percent: number
}

export interface AppUpdateCheckResult {
  status: 'available' | 'up-to-date' | 'unavailable'
  version: string | null
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

// Markdown extensions define files recognized by workspace scanning and dialogs.
export const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

// IPC channels centralize communication names shared by all Electron processes.
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
  imageSelectDirectory: 'image:select-directory',
  imageGitHubStatus: 'image:github-status',
  imageGitHubConfigure: 'image:github-configure',
  imageGitHubClear: 'image:github-clear',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  menuAction: 'menu:action',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  recentChanged: 'recent:changed',
  dirtyCountChanged: 'app:dirty-count-changed',
  appVersionGet: 'app:version-get',
  appTakeOpenFilePaths: 'app:take-open-file-paths',
  appOpenFilesRequested: 'app:open-files-requested',
  updaterStateGet: 'updater:state-get',
  updaterStateChanged: 'updater:state-changed',
  updaterDownloadProgressGet: 'updater:download-progress-get',
  updaterDownloadProgressChanged: 'updater:download-progress-changed',
  updaterCheck: 'updater:check',
  updaterOpenDownload: 'updater:open-download',
  updaterInstall: 'updater:install'
} as const



