import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
// 快捷键分组集中描述设置页需要展示的文件与视图操作。
const SHORTCUT_GROUPS = [
  {
    value: 'file',
    label: 'settings.files',
    shortcuts: [
      { label: 'settings.new-file', keys: ['N'] },
      { label: 'settings.open-file', keys: ['O'] },
      { label: 'settings.open-folder', keys: ['Shift', 'O'] },
      { label: 'settings.save', keys: ['S'] },
      { label: 'settings.save-as', keys: ['Shift', 'S'] },
      { label: 'settings.close-tab', keys: ['W'] }
    ]
  },
  {
    value: 'view',
    label: 'settings.view',
    shortcuts: [
      { label: 'settings.toggle-file-tree', keys: ['B'] },
      { label: 'settings.toggle-outline', keys: ['Shift', 'E'] },
      { label: 'settings.toggle-source-mode', keys: ['/'] },
      { label: 'settings.toggle-theme', keys: ['Shift', 'T'] }
    ]
  }
] as const

// 主修饰键按照当前桌面平台显示为 Command 或 Ctrl。
const PRIMARY_MODIFIER = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

/** 展示 Inkdown 当前支持的固定快捷键。 */
export function ShortcutSettingsSection(): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">{t('settings.keyboard-shortcuts')}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('settings.view-inkdown-keyboard-shortcuts-custom-shortcuts-are-not-supported-yet')}</p>

      <div className="mt-7 max-w-2xl space-y-7">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.value} aria-labelledby={`shortcut-group-${group.value}`}>
            <h3
              id={`shortcut-group-${group.value}`}
              className="text-sm font-medium text-foreground"
            >
              {t(group.label)}
            </h3>
            <dl className="mt-3 divide-y border-y">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex min-h-12 items-center justify-between gap-4 py-3"
                >
                  <dt className="text-sm text-foreground">{t(shortcut.label)}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    {[PRIMARY_MODIFIER, ...shortcut.keys].map((key, index) => (
                      <kbd
                        key={`${shortcut.label}-${key}-${index}`}
                        className="inline-flex min-w-7 items-center justify-center rounded-md border bg-muted px-2 py-1 font-sans text-xs font-medium text-muted-foreground shadow-xs"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
