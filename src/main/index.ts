import { app, shell, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  IPC_CHANNELS,
  type FileNode,
  type MenuAction,
  type PersistedState,
  type WriteFileRequest
} from '../shared/contracts'
import { addFileRoot, addWorkspaceRoot, isAuthorized } from './security'
import { installApplicationMenu } from './menu'
import { loadState, addRecentWorkspace, addRecentFile, setTheme, updateState } from './state'
import {
  createFolder,
  createMarkdownFile,
  importImage,
  readMarkdown,
  renameEntry,
  revealEntry,
  scanDir,
  trashEntry,
  writeMarkdown
} from './files'
import {
  beginInternalWrite,
  endInternalWrite,
  startWorkspaceWatcher,
  stopWorkspaceWatcher
} from './watcher'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'inkdown-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let dirtyCount = 0

function getWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('主窗口不可用')
  return mainWindow
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function registerProtocolHandler(): void {
  protocol.handle('inkdown-file', async (request) => {
    try {
      const url = new URL(request.url)
      const encodedPath = url.searchParams.get('path')
      if (!encodedPath) return new Response('缺少 path 参数', { status: 400 })
      const filePath = resolve(decodeURIComponent(encodedPath))
      if (!isAuthorized(filePath)) return new Response('无权访问该文件', { status: 403 })
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('文件不存在', { status: 404 })
    }
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.workspaceOpen, async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '打开文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const root = resolve(result.filePaths[0])
    addWorkspaceRoot(root)
    await addRecentWorkspace(root)
    startWorkspaceWatcher(root, getWindow())
    const nodes = await scanDir(root)
    return { root, nodes } satisfies { root: string; nodes: FileNode[] }
  })

  ipcMain.handle(IPC_CHANNELS.workspaceOpenPath, async (_event, directory: string) => {
    const root = resolve(directory)
    addWorkspaceRoot(root)
    await addRecentWorkspace(root)
    startWorkspaceWatcher(root, getWindow())
    const nodes = await scanDir(root)
    return { root, nodes } satisfies { root: string; nodes: FileNode[] }
  })
  ipcMain.handle(IPC_CHANNELS.workspaceScan, async (_event, directory: string) => {
    const resolved = resolve(directory)
    if (!isAuthorized(resolved)) throw new Error('目录不在授权范围内')
    return scanDir(resolved)
  })

  ipcMain.handle(IPC_CHANNELS.fileOpen, async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = resolve(result.filePaths[0])
    addFileRoot(filePath)
    await addRecentFile(filePath)
    return readMarkdown(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.fileOpenPath, async (_event, filePath: string) => {
    const resolved = resolve(filePath)
    addFileRoot(resolved)
    await addRecentFile(resolved)
    return readMarkdown(resolved)
  })
  ipcMain.handle(IPC_CHANNELS.fileRead, async (_event, filePath: string) => {
    const resolved = resolve(filePath)
    if (!isAuthorized(resolved)) throw new Error('文件不在授权范围内')
    return readMarkdown(resolved)
  })

  ipcMain.handle(IPC_CHANNELS.fileSave, async (_event, request: WriteFileRequest) => {
    const resolved = resolve(request.path)
    if (!isAuthorized(resolved)) throw new Error('文件不在授权范围内')
    beginInternalWrite(resolved)
    let succeeded = false
    try {
      await writeMarkdown(resolved, request.content, request.newline, request.hasBom)
      succeeded = true
      return { path: resolved, name: resolved.split(/[\\/]/).pop() ?? '', savedAt: Date.now() }
    } finally {
      endInternalWrite(resolved, succeeded)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.fileSaveAs,
    async (
      _event,
      payload: { defaultName?: string; content: string; newline: '\r\n' | '\n'; hasBom: boolean }
    ) => {
      const result = await dialog.showSaveDialog(getWindow(), {
        title: '保存 Markdown 文件',
        defaultPath: payload.defaultName || '未命名.md',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })
      if (result.canceled || !result.filePath) return null

      const filePath = resolve(result.filePath)
      addFileRoot(filePath)
      await addRecentFile(filePath)
      await writeMarkdown(filePath, payload.content, payload.newline, payload.hasBom)
      return { path: filePath, name: filePath.split(/[\\/]/).pop() ?? '', savedAt: Date.now() }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.fileCreate,
    async (_event, payload: { directory: string; name: string }) => {
      const node = await createMarkdownFile(payload.directory, payload.name)
      return node
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.fileCreateFolder,
    async (_event, payload: { directory: string; name: string }) => {
      return createFolder(payload.directory, payload.name)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.fileRename,
    async (_event, payload: { path: string; name: string }) => {
      return renameEntry(payload.path, payload.name)
    }
  )

  ipcMain.handle(IPC_CHANNELS.fileTrash, async (_event, target: string) => {
    await trashEntry(target)
  })

  ipcMain.handle(IPC_CHANNELS.fileReveal, async (_event, target: string) => {
    await revealEntry(target)
  })

  ipcMain.handle(
    IPC_CHANNELS.imageImport,
    async (_event, payload: { name: string; data: Uint8Array; targetDir: string }) => {
      return importImage(payload)
    }
  )

  ipcMain.handle(IPC_CHANNELS.windowMinimize, () => getWindow().minimize())
  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, () => {
    const window = getWindow()
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle(IPC_CHANNELS.windowClose, () => getWindow().close())
  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, () => getWindow().isMaximized())

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => loadState())
  ipcMain.handle(IPC_CHANNELS.settingsSet, async (_event, patch: Partial<PersistedState>) => {
    if (patch.theme) await setTheme(patch.theme)
    else await updateState(patch)
    return loadState()
  })

  ipcMain.on(IPC_CHANNELS.dirtyCountChanged, (_event, count: number) => {
    dirtyCount = Math.max(0, Number(count) || 0)
  })
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  void updateState({ windowBounds: bounds })
}

async function createWindow(): Promise<void> {
  const state = await loadState()
  const isMac = process.platform === 'darwin'
  const windowOptions = state.windowBounds ?? { width: 1200, height: 800 }

  const window = new BrowserWindow({
    ...windowOptions,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: state.theme === 'dark' ? '#0f1412' : '#f5f7f6',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : { frame: false }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: true
    }
  })

  mainWindow = window

  window.on('ready-to-show', () => window.show())
  window.on('maximize', () => sendToRenderer(IPC_CHANNELS.windowMaximizedChanged, true))
  window.on('unmaximize', () => sendToRenderer(IPC_CHANNELS.windowMaximizedChanged, false))
  window.on('closed', () => {
    stopWorkspaceWatcher()
    mainWindow = null
  })
  window.on('close', (event) => {
    if (dirtyCount <= 0) {
      saveWindowBounds()
      return
    }
    event.preventDefault()
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        title: '未保存的更改',
        message: '有文档尚未保存，确定要退出吗？',
        detail: '退出后未保存的更改将会丢失。',
        buttons: ['取消', '退出'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      .then((result) => {
        if (result.response === 1) {
          dirtyCount = 0
          saveWindowBounds()
          window.destroy()
        }
      })
  })

  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.inkdown.app')
  registerProtocolHandler()
  registerIpcHandlers()

  installApplicationMenu((action: MenuAction) => {
    sendToRenderer(IPC_CHANNELS.menuAction, action)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
