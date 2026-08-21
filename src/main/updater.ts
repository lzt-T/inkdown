import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

// Latest release page is the manual download destination used by macOS.
const LATEST_RELEASE_URL = 'https://github.com/lzt-T/inkdown/releases/latest'

interface UpdateServiceOptions {
  getWindow: () => BrowserWindow | null
  hasUnsavedDocuments: () => boolean
  prepareToInstall: () => void
}

interface PlatformUpdatePolicy {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  handleAvailable?: (info: UpdateInfo, options: UpdateServiceOptions) => Promise<void>
  handleDownloaded?: (info: UpdateInfo, options: UpdateServiceOptions) => Promise<void>
}

/** Prompts macOS users to download the unsigned release manually. */
async function showMacUpdatePrompt(
  info: UpdateInfo,
  options: UpdateServiceOptions
): Promise<void> {
  // Active window keeps the update prompt attached to the application.
  const window = options.getWindow()
  if (!window || window.isDestroyed()) return

  // User choice determines whether the release page opens externally.
  const result = await dialog.showMessageBox(window, {
    type: 'info',
    title: '发现新版本',
    message: `Inkdown ${info.version} 已发布`,
    detail: 'macOS 版本需要前往 GitHub Releases 手动下载安装。',
    buttons: ['稍后', '前往下载'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (result.response === 1) await shell.openExternal(LATEST_RELEASE_URL)
}

/** Prompts Windows and Linux users after an update finishes downloading. */
async function showDownloadedUpdatePrompt(
  info: UpdateInfo,
  options: UpdateServiceOptions
): Promise<void> {
  // Active window keeps the update prompt attached to the application.
  const window = options.getWindow()
  if (!window || window.isDestroyed()) return

  if (options.hasUnsavedDocuments()) {
    await dialog.showMessageBox(window, {
      type: 'info',
      title: '更新已下载',
      message: `Inkdown ${info.version} 已准备好安装`,
      detail: '当前有未保存的文档。请先保存，更新将在稍后退出应用时安装。',
      buttons: ['知道了'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    return
  }

  // User choice controls whether installation starts immediately or on a later exit.
  const result = await dialog.showMessageBox(window, {
    type: 'info',
    title: '更新已下载',
    message: `Inkdown ${info.version} 已准备好安装`,
    detail: '立即重启以完成更新，或稍后退出应用时自动安装。',
    buttons: ['稍后', '立即重启'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (result.response !== 1) return

  options.prepareToInstall()
  autoUpdater.quitAndInstall(false, true)
}

// Platform policies dispatch the fixed update behavior for each packaged target.
const UPDATE_POLICIES: Partial<Record<NodeJS.Platform, PlatformUpdatePolicy>> = {
  darwin: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    handleAvailable: showMacUpdatePrompt
  },
  win32: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    handleDownloaded: showDownloadedUpdatePrompt
  },
  linux: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    handleDownloaded: showDownloadedUpdatePrompt
  }
}

/** Configures one silent update check for the current packaged application session. */
export function startAutoUpdater(options: UpdateServiceOptions): void {
  // Current platform policy defines download and installation behavior.
  const policy = UPDATE_POLICIES[process.platform]
  if (!app.isPackaged || !policy) return

  autoUpdater.autoDownload = policy.autoDownload
  autoUpdater.autoInstallOnAppQuit = policy.autoInstallOnAppQuit
  autoUpdater.on('update-available', (info) => {
    void policy.handleAvailable?.(info, options)
  })
  autoUpdater.on('update-downloaded', (info) => {
    void policy.handleDownloaded?.(info, options)
  })
  autoUpdater.on('error', (error) => {
    console.error('自动更新失败:', error)
  })

  // The error event reports failures without interrupting application startup.
  void autoUpdater.checkForUpdates().catch(() => undefined)
}
