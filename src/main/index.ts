import { app, shell, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { extname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  IPC_CHANNELS,
  MARKDOWN_EXTENSIONS,
  type ConfigureGitHubImageStorageRequest,
  type FileNode,
  type ImportImageRequest,
  type MenuAction,
  type PersistedState,
  type WriteFileRequest
} from '../shared/contracts'
import { addFileRoot, addWorkspaceRoot, isAuthorized, setImageRoot } from './security'
import { installApplicationMenu } from './menu'
import { loadState, addRecentWorkspace, addRecentFile, updateState } from './state'
import {
  createFolder,
  createMarkdownFile,
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
import { startAutoUpdater } from './updater'
import { importStoredImage, normalizeImageStorageSettings } from './image-storage'
import {
  clearGitHubImageStorageToken,
  configureGitHubImageStorage,
  getGitHubImageStorageStatus
} from './github-image-storage'
import { applyProxySettings } from './proxy'

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

// Main application window is shared by native handlers and update prompts.
let mainWindow: BrowserWindow | null = null
// Dirty document count protects unsaved editor content during application exit.
let dirtyCount = 0
// Update installation bypasses the normal close confirmation after explicit consent.
let isInstallingUpdate = false
// 待打开路径用于将系统打开请求传递给已挂载的渲染进程。
const pendingOpenFilePaths: string[] = []

/** 从应用命令行中提取支持的 Markdown 文件路径。 */
function getMarkdownFilePaths(commandLine: string[]): string[] {
  return commandLine
    .filter((argument) => MARKDOWN_EXTENSIONS.has(extname(argument).slice(1).toLowerCase()))
    .map((argument) => resolve(argument))
}

/** 将 Markdown 路径加入队列，并在窗口存在时通知渲染进程。 */
function queueOpenFilePaths(paths: string[]): void {
  // 新路径保持调用顺序，同时避免重复加入同一个待处理请求。
  const nextPaths = paths.filter((path) => !pendingOpenFilePaths.includes(path))
  if (nextPaths.length === 0) return
  pendingOpenFilePaths.push(...nextPaths)
  sendToRenderer(IPC_CHANNELS.appOpenFilesRequested)
}

/** 恢复并聚焦现有应用窗口。 */
function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function getWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('主窗口不可用')
  return mainWindow
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

/** Persists a recently opened workspace and synchronizes it with the renderer. */
async function recordRecentWorkspace(workspace: string): Promise<void> {
  // Updated recent state is the event payload consumed by the renderer.
  const recent = await addRecentWorkspace(workspace)
  sendToRenderer(IPC_CHANNELS.recentChanged, recent)
}

/** Persists a recently used file and synchronizes it with the renderer. */
async function recordRecentFile(filePath: string): Promise<void> {
  // Updated recent state is the event payload consumed by the renderer.
  const recent = await addRecentFile(filePath)
  sendToRenderer(IPC_CHANNELS.recentChanged, recent)
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
    const nodes = await scanDir(root)
    await recordRecentWorkspace(root)
    startWorkspaceWatcher(root, getWindow())
    return { root, nodes } satisfies { root: string; nodes: FileNode[] }
  })

  ipcMain.handle(IPC_CHANNELS.workspaceOpenPath, async (_event, directory: string) => {
    const root = resolve(directory)
    addWorkspaceRoot(root)
    const nodes = await scanDir(root)
    await recordRecentWorkspace(root)
    startWorkspaceWatcher(root, getWindow())
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
    // File data is returned only after the successful read is recorded.
    const data = await readMarkdown(filePath)
    await recordRecentFile(filePath)
    return data
  })

  ipcMain.handle(IPC_CHANNELS.fileOpenPath, async (_event, filePath: string) => {
    const resolved = resolve(filePath)
    addFileRoot(resolved)
    // File data is returned only after the successful read is recorded.
    const data = await readMarkdown(resolved)
    await recordRecentFile(resolved)
    return data
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
      await recordRecentFile(resolved)
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
      await writeMarkdown(filePath, payload.content, payload.newline, payload.hasBom)
      await recordRecentFile(filePath)
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
    async (_event, request: ImportImageRequest) => {
      // Main process derives the active strategy from trusted persisted settings.
      return importStoredImage(request)
    }
  )

  ipcMain.handle(IPC_CHANNELS.imageSelectDirectory, async () => {
    // Native directory picker is the only UI used to choose a global image location.
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择图片保存目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : resolve(result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.imageGitHubStatus, async () => getGitHubImageStorageStatus())
  ipcMain.handle(
    IPC_CHANNELS.imageGitHubConfigure,
    async (_event, request: ConfigureGitHubImageStorageRequest) => {
      // Repository validation and secret storage complete before GitHub mode becomes active.
      const github = await configureGitHubImageStorage(request)
      // Latest state preserves unrelated image settings while activating the validated strategy.
      const current = await loadState()
      await updateState({ imageStorage: { ...current.imageStorage, mode: 'github', github } })
      return { settings: github, hasToken: true }
    }
  )
  ipcMain.handle(IPC_CHANNELS.imageGitHubClear, async () => {
    // Persisted mode changes first so a failed credential deletion cannot leave GitHub active.
    const current = await loadState()
    // Active GitHub storage falls back to the portable document-relative default.
    const mode = current.imageStorage.mode === 'github' ? 'relative' : current.imageStorage.mode
    // Updated state removes public repository metadata before the credential is deleted.
    const state = await updateState({
      imageStorage: { ...current.imageStorage, mode, github: null }
    })
    await clearGitHubImageStorageToken()
    return state.imageStorage
  })

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
    // Proxy settings are validated and applied before becoming the persisted source of truth.
    const proxy = patch.proxy ? await applyProxySettings(patch.proxy) : undefined
    // Image settings receive path validation before sharing the generic persistence flow.
    const normalizedPatch: Partial<PersistedState> = {
      ...patch,
      ...(patch.imageStorage
        ? { imageStorage: normalizeImageStorageSettings(patch.imageStorage) }
        : {}),
      ...(proxy ? { proxy } : {})
    }
    // Updated state supplies the protocol authorization used immediately after saving.
    const state = await updateState(normalizedPatch)
    setImageRoot(state.imageStorage.globalDirectory)
    return state
  })

  ipcMain.on(IPC_CHANNELS.dirtyCountChanged, (_event, count: number) => {
    dirtyCount = Math.max(0, Number(count) || 0)
  })
  ipcMain.handle(IPC_CHANNELS.appVersionGet, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.appTakeOpenFilePaths, () => pendingOpenFilePaths.splice(0))
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  void updateState({ windowBounds: bounds })
}

async function createWindow(): Promise<void> {
  // Persisted global image root must be authorized before renderer content loads.
  const state = await loadState()
  setImageRoot(state.imageStorage.globalDirectory)
  const isMac = process.platform === 'darwin'
  const windowOptions = state.windowBounds ?? { width: 1200, height: 800 }

  const window = new BrowserWindow({
    ...windowOptions,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: state.theme === 'dark' ? '#09090b' : '#f6f8fc',
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
    if (isInstallingUpdate || dirtyCount <= 0) {
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

// 单实例锁确保后续系统打开请求进入现有编辑器窗口。
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  queueOpenFilePaths(getMarkdownFilePaths(process.argv))

  app.on('second-instance', (_event, commandLine) => {
    queueOpenFilePaths(getMarkdownFilePaths(commandLine))
    focusMainWindow()
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    queueOpenFilePaths(getMarkdownFilePaths([filePath]))
    focusMainWindow()
  })
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  electronApp.setAppUserModelId('com.inkdown.app')
  registerProtocolHandler()
  registerIpcHandlers()

  // Persisted proxy settings must be active before any updater or window network request.
  const initialState = await loadState()
  await applyProxySettings(initialState.proxy)

  // Update controller stores actionable state until the renderer is ready.
  const updater = startAutoUpdater({
    /** Marks the user-approved update exit so the close guard can allow installation. */
    prepareToInstall: () => {
      isInstallingUpdate = true
    },
    /** Broadcasts update state without requiring the renderer to be mounted already. */
    onStateChanged: (state) => sendToRenderer(IPC_CHANNELS.updaterStateChanged, state),
    /** Broadcasts download progress without requiring the renderer to be mounted already. */
    onDownloadProgressChanged: (progress) =>
      sendToRenderer(IPC_CHANNELS.updaterDownloadProgressChanged, progress)
  })
  ipcMain.handle(IPC_CHANNELS.updaterStateGet, updater.getState)
  ipcMain.handle(IPC_CHANNELS.updaterDownloadProgressGet, updater.getDownloadProgress)
  ipcMain.handle(IPC_CHANNELS.updaterCheck, updater.check)
  ipcMain.handle(IPC_CHANNELS.updaterOpenDownload, updater.openDownload)
  ipcMain.handle(IPC_CHANNELS.updaterInstall, updater.install)

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
