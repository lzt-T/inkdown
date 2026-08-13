import type { ElectronAPI } from '@electron-toolkit/preload'
import type { InkdownApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: InkdownApi
  }
}
