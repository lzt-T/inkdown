import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { initialSettings, rendererI18n, t } from '@/lib/i18n'
import type { LanguagePreference } from '../../../../../shared/localization'

// 首次语言偏好来自应用启动时已读取的设置。
let currentPreference: LanguagePreference = 'system'
initialSettings.then((settings) => { currentPreference = settings.language })

/** 展示语言偏好，保存成功后再切换当前界面语言。 */
export function LanguageSettings(): React.JSX.Element {
  useTranslation()
  // 语言控件显示已提交的偏好，不重复存储实际语言。
  const [preference, setPreference] = useState(currentPreference)
  // 保存期间避免并发选择导致语言与配置不一致。
  const [saving, setSaving] = useState(false)

  /** 持久化用户选择并采用主进程返回的实际语言。 */
  async function changeLanguage(value: LanguagePreference): Promise<void> {
    setSaving(true)
    try {
      // 返回快照是主进程解析后的统一语言来源。
      const settings = await window.api.settings.set({ language: value })
      await rendererI18n.changeLanguage(settings.resolvedLocale)
      currentPreference = settings.language
      setPreference(settings.language)
    } catch (error) {
      toast.error(t('settings.language-save-failed'), { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-7">
      <label htmlFor="app-language" className="block text-sm font-medium text-foreground">
        {t('settings.language')}
      </label>
      <Select
        value={preference}
        disabled={saving}
        onValueChange={(value) => void changeLanguage(value as LanguagePreference)}
      >
        <SelectTrigger id="app-language" className="mt-3 w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('settings.follow-system')}</SelectItem>
          <SelectItem value="zh-CN">简体中文</SelectItem>
          <SelectItem value="en-US">English</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
