import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  Image,
  Info,
  Keyboard,
  Moon,
  Network,
  Palette,
  Sun
} from 'lucide-react'
import { AboutSettingsSection } from '@/pages/settings/components/AboutSettingsSection'
import { ImageSettingsSection } from '@/pages/settings/components/ImageSettingsSection'
import { LanguageSettings } from '@/pages/settings/components/LanguageSettings'
import { ProxySettingsSection } from '@/pages/settings/components/ProxySettingsSection'
import { ShortcutSettingsSection } from '@/pages/settings/components/ShortcutSettingsSection'
import type { UpdateCheckViewState } from '@/hooks/useAppUpdater'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import type { AppUpdateState, ThemeMode } from '../../../../shared/contracts'

interface SettingsPageProps {
  onClose: () => void
  updateState: AppUpdateState | null
  currentVersion: string | null
  checkState: UpdateCheckViewState
  onCheckForUpdates: () => void
  onOpenUpdate: () => void
}

interface ThemeOption {
  value: ThemeMode
  label: string
  description: string
  icon: typeof Sun
}

type SettingsCategory = 'appearance' | 'images' | 'network' | 'shortcuts' | 'about'

interface SettingsCategoryOption {
  value: SettingsCategory
  label: string
  icon: typeof Sun
}

// Theme choices form the first expandable settings category.
const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'settings.light',
    description: 'settings.a-bright-clear-writing-interface',
    icon: Sun
  },
  {
    value: 'dark',
    label: 'settings.dark',
    description: 'settings.a-dark-interface-for-low-light-environments',
    icon: Moon
  }
]

// Settings categories provide a fixed navigation-to-section mapping.
const SETTINGS_CATEGORIES: SettingsCategoryOption[] = [
  { value: 'appearance', label: 'settings.appearance', icon: Palette },
  { value: 'images', label: 'settings.images', icon: Image },
  { value: 'network', label: 'settings.network', icon: Network },
  { value: 'shortcuts', label: 'settings.keyboard-shortcuts', icon: Keyboard },
  { value: 'about', label: 'settings.about', icon: Info }
]

/** Renders the dedicated application settings workspace. */
export function SettingsPage({
  onClose,
  updateState,
  currentVersion,
  checkState,
  onCheckForUpdates,
  onOpenUpdate
}: SettingsPageProps): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  const theme = useEditorStore((state) => state.theme)
  const setTheme = useEditorStore((state) => state.setTheme)
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')

  const sectionContent: Record<SettingsCategory, React.JSX.Element> = {
    appearance: (
      <div>
        <header className="border-b pb-4">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
            {t('settings.appearance')}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {t('settings.choose-a-theme-for-your-environment-changes-apply-immediately')}
          </p>
        </header>

        <LanguageSettings />

        <div className="py-5">
          <h3 className="text-[13px] font-medium text-foreground">{t('settings.theme')}</h3>
          <div className="mt-3 grid gap-3 @min-[28rem]:grid-cols-2">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = theme === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'group rounded-xl border p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-px',
                    isSelected
                      ? 'border-primary bg-selected/50'
                      : 'bg-card hover:border-primary/40 hover:bg-accent/40'
                  )}
                >
                  <span
                    className={cn(
                      'relative block h-24 overflow-hidden rounded-lg border',
                      option.value === 'light'
                        ? 'border-[#e5e6eb] bg-[#ffffff]'
                        : 'border-[#272931] bg-[#18191d]'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-4.5 border-b',
                        option.value === 'light'
                          ? 'border-[#e5e6eb] bg-[#f4f4f6]'
                          : 'border-[#272931] bg-[#131417]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute bottom-0 left-0 top-4.5 w-11 border-r',
                        option.value === 'light'
                          ? 'border-[#e5e6eb] bg-[#f4f4f6]'
                          : 'border-[#272931] bg-[#131417]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-15 top-8 h-2 w-16 rounded-full',
                        option.value === 'light' ? 'bg-[#18191d]' : 'bg-[#eceef2]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-15 top-12 h-1.5 w-26 rounded-full',
                        option.value === 'light' ? 'bg-[#5f6370]/70' : 'bg-[#8d919e]/70'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-15 top-15.5 h-1.5 w-13 rounded-full',
                        option.value === 'light' ? 'bg-[#2563eb]' : 'bg-[#5b9bff]'
                      )}
                    />
                  </span>

                  <span className="mt-2.5 flex items-start gap-2.5 px-1 pb-0.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                        {t(option.label)}
                        {isSelected && <Check className="size-3.5 text-primary" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t(option.description)}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    ),
    images: <ImageSettingsSection />,
    network: <ProxySettingsSection />,
    shortcuts: <ShortcutSettingsSection />,
    about: (
      <AboutSettingsSection
        updateState={updateState}
        currentVersion={currentVersion}
        checkState={checkState}
        onCheckForUpdates={onCheckForUpdates}
        onOpenUpdate={onOpenUpdate}
      />
    )
  }

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-panel sm:w-56">
        <div className="shrink-0 border-b px-2.5 py-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-[13px] font-medium text-panel-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="flex items-center gap-2">
              <ArrowLeft className="size-3.5 text-muted-foreground" />
              <span>{t('settings.back-to-editor')}</span>
            </span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
              Esc
            </kbd>
          </button>
        </div>

        <nav
          aria-label={t('settings.settings-categories')}
          className="flex-1 space-y-0.5 overflow-y-auto p-2"
        >
          {SETTINGS_CATEGORIES.map((category) => {
            const Icon = category.icon
            const isSelected = activeCategory === category.value
            return (
              <button
                key={category.value}
                type="button"
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => setActiveCategory(category.value)}
                className={cn(
                  'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                  isSelected
                    ? 'bg-selected text-foreground'
                    : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  )}
                />
                <span className="truncate">{t(category.label)}</span>
              </button>
            )
          })}
        </nav>

        {currentVersion && (
          <div className="shrink-0 px-4 py-3 text-[11px] tabular-nums text-muted-foreground/75">
            Inkdown · {t('settings.version-value', { v0: currentVersion })}
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="@container mx-auto w-full max-w-2xl px-6 py-7 sm:px-10 sm:py-8">
          {sectionContent[activeCategory]}
        </div>
      </section>
    </main>
  )
}
