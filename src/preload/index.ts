import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC_CHANNELS,
  type AppUpdateCheckResult,
  type AppUpdateState,
  type ConfigureGitHubImageStorageRequest,
  type GitHubImageStorageStatus,
  type ImageStorageSettings,
  type ImportImageRequest,
  type ImportImageResult,
  type MenuAction,
  type PersistedState,
  type RecentState,
  type WriteFileRequest
} from '../shared/contracts'

const api = {
  workspace: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpen),
    openPath: (directory: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpenPath, directory),
    scan: (directory: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceScan, directory),
    onChanged: (callback: (directory: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, directory: string): void => callback(directory)
      ipcRenderer.on(IPC_CHANNELS.workspaceChanged, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.workspaceChanged, listener) }
    }
  },
  file: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.fileOpen),
    openPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.fileOpenPath, path),
    read: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.fileRead, path),
    save: (request: WriteFileRequest) => ipcRenderer.invoke(IPC_CHANNELS.fileSave, request),
    saveAs: (payload: { defaultName?: string; content: string; newline: '\r\n' | '\n'; hasBom: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.fileSaveAs, payload),
    create: (directory: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.fileCreate, { directory, name }),
    createFolder: (directory: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.fileCreateFolder, { directory, name }),
    rename: (path: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.fileRename, { path, name }),
    trash: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.fileTrash, path),
    reveal: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.fileReveal, path)
  },
  image: {
    import: (request: ImportImageRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.imageImport, request) as Promise<ImportImageResult>,
    /** Opens the native picker used for global image storage. */
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.imageSelectDirectory) as Promise<string | null>,
    /** Returns public GitHub settings and whether an encrypted token is available. */
    getGitHubStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.imageGitHubStatus) as Promise<GitHubImageStorageStatus>,
    /** Validates and securely persists one GitHub image repository configuration. */
    configureGitHub: (request: ConfigureGitHubImageStorageRequest) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.imageGitHubConfigure,
        request
      ) as Promise<GitHubImageStorageStatus>,
    /** Removes GitHub image configuration and its encrypted credential. */
    clearGitHub: () =>
      ipcRenderer.invoke(IPC_CHANNELS.imageGitHubClear) as Promise<ImageStorageSettings>
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized) as Promise<boolean>,
    onMaximizedChanged: (callback: (maximized: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
      ipcRenderer.on(IPC_CHANNELS.windowMaximizedChanged, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.windowMaximizedChanged, listener) }
    }
  },
  menu: {
    onAction: (callback: (action: MenuAction) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action)
      ipcRenderer.on(IPC_CHANNELS.menuAction, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.menuAction, listener) }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as Promise<PersistedState>,
    set: (patch: Partial<PersistedState>) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch) as Promise<PersistedState>,
    /** Subscribes to recent-state changes broadcast by the main process. */
    onRecentChanged: (callback: (recent: RecentState) => void) => {
      /** Forwards persisted recent-state updates into the renderer callback. */
      const listener = (_event: Electron.IpcRendererEvent, recent: RecentState): void =>
        callback(recent)
      ipcRenderer.on(IPC_CHANNELS.recentChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.recentChanged, listener)
      }
    }
  },
  app: {
    setDirtyCount: (count: number) => ipcRenderer.send(IPC_CHANNELS.dirtyCountChanged, count),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appVersionGet) as Promise<string>,
    /** 获取并清空系统打开请求所排队的文件路径。 */
    takeOpenFilePaths: () =>
      ipcRenderer.invoke(IPC_CHANNELS.appTakeOpenFilePaths) as Promise<string[]>,
    /** 订阅系统发起的 Markdown 文件打开请求。 */
    onOpenFilesRequested: (callback: () => void) => {
      /** 将待打开文件通知转发给渲染进程回调。 */
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.appOpenFilesRequested, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.appOpenFilesRequested, listener)
      }
    }
  },
  updater: {
    getState: () =>
      ipcRenderer.invoke(IPC_CHANNELS.updaterStateGet) as Promise<AppUpdateState | null>,
    onStateChanged: (callback: (state: AppUpdateState) => void) => {
      /** Forwards actionable update states into the renderer callback. */
      const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState): void =>
        callback(state)
      ipcRenderer.on(IPC_CHANNELS.updaterStateChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.updaterStateChanged, listener)
      }
    },
    check: () =>
      ipcRenderer.invoke(IPC_CHANNELS.updaterCheck) as Promise<AppUpdateCheckResult>,
    openDownload: () => ipcRenderer.invoke(IPC_CHANNELS.updaterOpenDownload) as Promise<boolean>,
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updaterInstall) as Promise<boolean>
  }
}

export type InkdownApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore define in dts
  window.electron = electronAPI
  // @ts-ignore define in dts
  window.api = api
}



