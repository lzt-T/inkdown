import { app } from 'electron'
import type { TOptions } from 'i18next'
import { createLocalization, resolveLocale } from '../shared/localization'
import type { PersistedState, SettingsSnapshot } from '../shared/contracts'

// 原生交互只使用主进程的国际化实例。
export const mainI18n = createLocalization()

/** 在操作发生时翻译原生文案，避免菜单和错误提示缓存旧语言。 */
export function t(key: string, options?: TOptions): string {
  return mainI18n.t(key, options)
}

/** 设置快照附带实际语言，不将解析结果写入持久化配置。 */
export function getSettingsSnapshot(state: PersistedState): SettingsSnapshot {
  return { ...state, resolvedLocale: resolveLocale(state.language, app.getLocale()) }
}
