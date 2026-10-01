import type { TOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { createLocalization } from '../../../shared/localization'

// 渲染端实例通知组件刷新，不与主进程共享可变对象。
export const rendererI18n = createLocalization().use(initReactI18next)
// 启动快照在首次挂载前读取，App 的历史恢复直接复用。
export const initialSettings = window.api.settings.get()

/** Store 和组件在调用时读取当前语言文案。 */
export function t(key: string, options?: TOptions): string {
  return rendererI18n.t(key, options)
}

/** 根据当前实例更新页面语言属性。 */
export function syncDocumentLanguage(): void {
  document.documentElement.lang = rendererI18n.resolvedLanguage ?? 'en-US'
}

rendererI18n.on('languageChanged', syncDocumentLanguage)
