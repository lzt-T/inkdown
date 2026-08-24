import { app, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { AppUpdateCheckResult, AppUpdateState } from '../shared/contracts'

// Latest release page is the manual download destination used by macOS.
const LATEST_RELEASE_URL = 'https://github.com/lzt-T/inkdown/releases/latest'

interface UpdateServiceOptions {
  prepareToInstall: () => void
  onStateChanged: (state: AppUpdateState) => void
}

interface PlatformUpdatePolicy {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  availableAction?: AppUpdateState['action']
  downloadedAction?: AppUpdateState['action']
}

export interface AutoUpdaterController {
  getState: () => AppUpdateState | null
  check: () => Promise<AppUpdateCheckResult>
  openDownload: () => Promise<boolean>
  install: () => boolean
}

// Platform policies dispatch the fixed update behavior for each packaged target.
const UPDATE_POLICIES: Partial<Record<NodeJS.Platform, PlatformUpdatePolicy>> = {
  darwin: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    availableAction: 'download'
  },
  win32: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    downloadedAction: 'install'
  },
  linux: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    downloadedAction: 'install'
  }
}

/** Configures one silent update check and exposes the current actionable update. */
export function startAutoUpdater(options: UpdateServiceOptions): AutoUpdaterController {
  // Current platform policy defines download and installation behavior.
  const policy = UPDATE_POLICIES[process.platform]
  // Current update state survives events emitted before the renderer mounts.
  let updateState: AppUpdateState | null = null

  /** Publishes one actionable update state to the renderer. */
  const publishState = (info: UpdateInfo, action?: AppUpdateState['action']): void => {
    if (!action) return
    updateState = { version: info.version, action }
    options.onStateChanged(updateState)
  }

  /** Checks the configured provider and returns a renderer-safe result. */
  async function checkForUpdates(): Promise<AppUpdateCheckResult> {
    if (!app.isPackaged || !policy) return { status: 'unavailable', version: null }
    // Updater result reports availability without waiting for an automatic download.
    const result = await autoUpdater.checkForUpdates()
    if (!result) return { status: 'unavailable', version: null }
    return {
      status: result.isUpdateAvailable ? 'available' : 'up-to-date',
      version: result.updateInfo.version
    }
  }

  // Controller methods keep renderer actions constrained to the active update state.
  const controller: AutoUpdaterController = {
    getState: () => updateState,
    check: checkForUpdates,
    openDownload: async () => {
      if (updateState?.action !== 'download') return false
      await shell.openExternal(LATEST_RELEASE_URL)
      return true
    },
    install: () => {
      if (updateState?.action !== 'install') return false
      options.prepareToInstall()
      autoUpdater.quitAndInstall(false, true)
      return true
    }
  }

  if (!app.isPackaged || !policy) return controller

  autoUpdater.autoDownload = policy.autoDownload
  autoUpdater.autoInstallOnAppQuit = policy.autoInstallOnAppQuit
  autoUpdater.on('update-available', (info) => {
    publishState(info, policy.availableAction)
  })
  autoUpdater.on('update-downloaded', (info) => {
    publishState(info, policy.downloadedAction)
  })
  autoUpdater.on('error', (error) => {
    console.error('自动更新失败:', error)
  })

  // The automatic check remains silent while manual checks surface their own result.
  void controller.check().catch(() => undefined)
  return controller
}
