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
import { ProxySettingsSection } from '@/pages/settings/components/ProxySettingsSection'
import { ShortcutSettingsSection } from '@/pages/settings/components/ShortcutSettingsSection'
import { useEditorStore } from '@/store/editor-store'
import { Button } from '@/components/ui/button'
import type { UpdateCheckViewState } from '@/hooks/useAppUpdater'
import { cn } from '@/lib/utils'
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
    label: '亮色',
    description: '明亮、清晰的写作界面',
    icon: Sun
  },
  {
    value: 'dark',
    label: '暗色',
    description: '适合低光环境的深色界面',
    icon: Moon
  }
]

// Settings categories provide a fixed navigation-to-section mapping.
const SETTINGS_CATEGORIES: SettingsCategoryOption[] = [
  { value: 'appearance', label: '外观', icon: Palette },
  { value: 'images', label: '图片', icon: Image },
  { value: 'network', label: '网络', icon: Network },
  { value: 'shortcuts', label: '快捷键', icon: Keyboard },
  { value: 'about', label: '关于', icon: Info }
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
  // Current theme controls the selected appearance option.
  const theme = useEditorStore((state) => state.theme)
  // Theme updates reuse the existing persistence flow in App.
  const setTheme = useEditorStore((state) => state.setTheme)
  // Active category selects the visible settings section.
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')
  // Section map keeps fixed category dispatch explicit and traceable.
  const sectionContent: Record<SettingsCategory, React.JSX.Element> = {
    appearance: (
      <div className="max-w-3xl">
        <h2 className="text-base font-semibold text-foreground">外观</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          选择更适合当前环境的界面主题，修改会立即生效。
        </p>

        <div className="mt-7">
          <h3 className="text-sm font-medium text-foreground">主题</h3>
          <div className="mt-3 grid gap-3 @min-[36rem]:grid-cols-2">
            {THEME_OPTIONS.map((option) => {
              // Each icon communicates the ambience of its corresponding theme.
              const Icon = option.icon
              // Selection drives visual emphasis and accessible pressed state.
              const isSelected = theme === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'group rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-px',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'bg-card hover:border-primary/40 hover:bg-accent/30'
                  )}
                >
                  <span
                    className={cn(
                      'relative block h-28 overflow-hidden rounded-md border',
                      option.value === 'light'
                        ? 'border-[#d4dde9] bg-[#f6f8fc]'
                        : 'border-[#303036] bg-[#09090b]'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-5 border-b',
                        option.value === 'light'
                          ? 'border-[#d4dde9] bg-white'
                          : 'border-[#303036] bg-[#18181b]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute bottom-0 left-0 top-5 w-12 border-r',
                        option.value === 'light'
                          ? 'border-[#d4dde9] bg-[#f2f5fb]'
                          : 'border-[#303036] bg-[#18181b]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-[4.5rem] top-10 h-2 w-20 rounded-full',
                        option.value === 'light' ? 'bg-[#162336]' : 'bg-[#f4f4f5]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-[4.5rem] top-16 h-1.5 w-28 rounded-full',
                        option.value === 'light' ? 'bg-[#5e7087]' : 'bg-[#a1a1aa]'
                      )}
                    />
                  </span>

                  <span className="mt-3 flex items-start gap-3 px-1 pb-1">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {option.label}
                        {isSelected && <Check className="size-3.5 text-primary" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {option.description}
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
    <main className="flex min-h-0 flex-1 overflow-auto bg-background">
      <div className="@container mx-auto w-full max-w-5xl px-8 py-10">
        <div className="mb-10 flex items-center gap-3 border-b pb-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-md"
            onClick={onClose}
            title="返回编辑器"
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">设置</h1>
            <p className="mt-1 text-xs text-muted-foreground">调整 Inkdown 的使用体验</p>
          </div>
        </div>

        <div className="grid gap-8 @min-[42rem]:grid-cols-[11rem_minmax(0,1fr)]">
          <nav aria-label="设置分类" className="space-y-1">
            {SETTINGS_CATEGORIES.map((category) => {
              // Category icon follows the fixed navigation configuration.
              const Icon = category.icon
              // Current category controls selection styling and accessible page state.
              const isSelected = activeCategory === category.value
              return (
                <button
                  key={category.value}
                  type="button"
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => setActiveCategory(category.value)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                    isSelected
                      ? 'bg-selected text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {category.label}
                </button>
              )
            })}
          </nav>

          <section className="min-w-0 border-t pt-6 @min-[42rem]:border-l @min-[42rem]:border-t-0 @min-[42rem]:pl-9 @min-[42rem]:pt-0">
            {sectionContent[activeCategory]}
          </section>
        </div>
      </div>
    </main>
  )
}
