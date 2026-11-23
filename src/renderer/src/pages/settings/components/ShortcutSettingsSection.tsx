import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { PRIMARY_MODIFIER } from '@/lib/platform'

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
      { label: 'workspace.toggle-sidebar', keys: ['B'] },
      { label: 'settings.toggle-outline', keys: ['Shift', 'E'] },
      { label: 'settings.toggle-source-mode', keys: ['/'] },
      { label: 'settings.toggle-theme', keys: ['Shift', 'T'] },
      { label: 'settings.settings', keys: [','] }
    ]
  }
] as const

/** 展示 Inkdown 当前支持的固定快捷键。 */
export function ShortcutSettingsSection(): React.JSX.Element {
  useTranslation()

  return (
    <div>
      <header className="border-b pb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
          {t('settings.keyboard-shortcuts')}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {t('settings.view-inkdown-keyboard-shortcuts-custom-shortcuts-are-not-supported-yet')}
        </p>
      </header>

      <div className="mt-5 space-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.value} aria-labelledby={`shortcut-group-${group.value}`}>
            <h3
              id={`shortcut-group-${group.value}`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t(group.label)}
            </h3>
            <dl className="mt-2 divide-y rounded-xl border bg-card/40">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex min-h-10 items-center justify-between gap-4 px-3.5 py-2"
                >
                  <dt className="text-[13px] text-foreground">{t(shortcut.label)}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    {[PRIMARY_MODIFIER, ...shortcut.keys].map((key, index) => (
                      <kbd
                        key={`${shortcut.label}-${key}-${index}`}
                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-muted/80 px-1.5 font-sans text-[11px] font-medium text-muted-foreground shadow-2xs"
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
