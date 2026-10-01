import { createInstance } from 'i18next'
import nativeZh from './locales/native.zh-CN.json'
import nativeEn from './locales/native.en-US.json'
import workspaceZh from './locales/workspace.zh-CN.json'
import workspaceEn from './locales/workspace.en-US.json'
import settingsZh from './locales/settings.zh-CN.json'
import settingsEn from './locales/settings.en-US.json'

export type AppLocale = 'zh-CN' | 'en-US'
export type LanguagePreference = 'system' | AppLocale

// 翻译资源随应用打包，主进程与渲染端分别创建实例。
export const localizationResources = {
  'zh-CN': { translation: { native: nativeZh, workspace: workspaceZh, settings: settingsZh } },
  'en-US': { translation: { native: nativeEn, workspace: workspaceEn, settings: settingsEn } }
}

/** 将语言偏好解析为当前应用支持的实际语言。 */
export function resolveLocale(preference: LanguagePreference, systemLocale: string): AppLocale {
  if (preference !== 'system') return preference
  return /^zh(?:[-_]|$)/i.test(systemLocale) ? 'zh-CN' : 'en-US'
}

/** 创建只加载本地资源的独立国际化实例。 */
export function createLocalization() {
  return createInstance({
    resources: localizationResources,
    fallbackLng: 'en-US',
    supportedLngs: ['zh-CN', 'en-US'],
    interpolation: { escapeValue: false }
  })
}
