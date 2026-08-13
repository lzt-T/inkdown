import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC_CHANNELS,
  type ImportImageRequest,
  type MenuAction,
  type PersistedState,
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
    import: (request: ImportImageRequest) => ipcRenderer.invoke(IPC_CHANNELS.imageImport, request)
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
    set: (patch: Partial<PersistedState>) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch)
  },
  app: {
    setDirtyCount: (count: number) => ipcRenderer.send(IPC_CHANNELS.dirtyCountChanged, count)
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



