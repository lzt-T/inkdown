import { useEffect, useState } from 'react'
import { ArrowLeft, Check, FolderOpen, Image, Info, Moon, Palette, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { AboutSettingsSection } from '@/pages/settings/components/AboutSettingsSection'
import { useEditorStore } from '@/store/editor-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UpdateCheckViewState } from '@/hooks/useAppUpdater'
import { cn } from '@/lib/utils'
import type {
  AppUpdateState,
  ImageStorageMode,
  ImageStorageSettings,
  ThemeMode
} from '../../../../shared/contracts'

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

type SettingsCategory = 'appearance' | 'images' | 'about'

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
  { value: 'about', label: '关于', icon: Info }
]

// Image storage labels map fixed strategy keys to their visible names.
const IMAGE_STORAGE_MODE_LABELS: Record<ImageStorageMode, string> = {
  relative: '相对文档目录',
  global: '全局固定目录'
}

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
  // Persisted image settings drive mode selection and directory values.
  const [imageStorage, setImageStorage] = useState<ImageStorageSettings | null>(null)
  // Relative directory input keeps editable text separate from persisted settings.
  const [relativeDirectory, setRelativeDirectory] = useState('assets')
  // Saving state prevents overlapping directory and mode updates.
  const [isSavingImageSettings, setIsSavingImageSettings] = useState(false)
  // Relative directory error is announced and reflected by the input state.
  const [relativeDirectoryError, setRelativeDirectoryError] = useState<string | null>(null)

  /** Persists image settings and synchronizes normalized values returned by the main process. */
  const persistImageStorage = async (next: ImageStorageSettings): Promise<boolean> => {
    setIsSavingImageSettings(true)
    try {
      // Main-process response contains normalized paths accepted for future imports.
      const state = await window.api.settings.set({ imageStorage: next })
      setImageStorage(state.imageStorage)
      setRelativeDirectory(state.imageStorage.relativeDirectory)
      setRelativeDirectoryError(null)
      return true
    } catch (error) {
      toast.error('图片保存设置未更新', { description: String(error) })
      return false
    } finally {
      setIsSavingImageSettings(false)
    }
  }

  /** Selects and persists a global image directory, switching mode only after confirmation. */
  const selectGlobalDirectory = async (): Promise<void> => {
    if (!imageStorage || isSavingImageSettings) return
    // Canceled native selection leaves the current settings unchanged.
    const directory = await window.api.image.selectDirectory()
    if (!directory) return
    await persistImageStorage({ ...imageStorage, mode: 'global', globalDirectory: directory })
  }

  /** Changes image storage mode while requiring a directory before entering global mode. */
  const changeImageStorageMode = async (mode: ImageStorageMode): Promise<void> => {
    if (!imageStorage || imageStorage.mode === mode || isSavingImageSettings) return
    if (mode === 'global' && !imageStorage.globalDirectory) {
      await selectGlobalDirectory()
      return
    }
    await persistImageStorage({ ...imageStorage, mode })
  }

  /** Saves the relative directory or restores the last accepted value after validation fails. */
  const saveRelativeDirectory = async (): Promise<void> => {
    if (!imageStorage || isSavingImageSettings) return
    if (relativeDirectory === imageStorage.relativeDirectory) return
    // Failed main-process validation restores the last persisted path.
    const isSaved = await persistImageStorage({ ...imageStorage, relativeDirectory })
    if (!isSaved) {
      setRelativeDirectory(imageStorage.relativeDirectory)
      setRelativeDirectoryError('请输入不包含绝对路径或“..”的相对目录')
    }
  }

  useEffect(() => {
    // Mounted guard prevents applying settings after the page closes.
    let mounted = true
    void window.api.settings.get().then((state) => {
      if (!mounted) return
      setImageStorage(state.imageStorage)
      setRelativeDirectory(state.imageStorage.relativeDirectory)
    })
    return () => {
      mounted = false
    }
  }, [])

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
                        : 'border-[#2f4366] bg-[#0c1220]'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-5 border-b',
                        option.value === 'light'
                          ? 'border-[#d4dde9] bg-white'
                          : 'border-[#2f4366] bg-[#131d31]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute bottom-0 left-0 top-5 w-12 border-r',
                        option.value === 'light'
                          ? 'border-[#d4dde9] bg-[#f2f5fb]'
                          : 'border-[#2f4366] bg-[#131d31]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-[4.5rem] top-10 h-2 w-20 rounded-full',
                        option.value === 'light' ? 'bg-[#162336]' : 'bg-[#e8efff]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-[4.5rem] top-16 h-1.5 w-28 rounded-full',
                        option.value === 'light' ? 'bg-[#5e7087]' : 'bg-[#93a7c3]'
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
    images: (
      <div className="max-w-3xl">
        <h2 className="text-base font-semibold text-foreground">图片</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          设置新插入图片的保存位置，已有图片不会被移动。
        </p>

        <div className="mt-7">
          <h3 className="text-sm font-medium text-foreground">保存位置</h3>
          {imageStorage ? (
            <div className="mt-3 space-y-5">
              <div
                role="group"
                aria-label="图片保存模式"
                className="inline-grid grid-cols-2 rounded-md bg-muted p-1"
              >
                {(['relative', 'global'] as const).map((mode) => {
                  // Mode label is a fixed value selected through the storage strategy key.
                  const label = IMAGE_STORAGE_MODE_LABELS[mode]
                  // Pressed state communicates the currently persisted strategy.
                  const isSelected = imageStorage.mode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isSavingImageSettings}
                      onClick={() => void changeImageStorageMode(mode)}
                      className={cn(
                        'rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                        isSelected
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {imageStorage.mode === 'relative' ? (
                <div>
                  <label htmlFor="relative-image-directory" className="text-sm font-medium text-foreground">
                    相对目录
                  </label>
                  <Input
                    id="relative-image-directory"
                    value={relativeDirectory}
                    disabled={isSavingImageSettings}
                    aria-invalid={Boolean(relativeDirectoryError)}
                    aria-describedby="relative-image-directory-help"
                    className="mt-2 max-w-xl"
                    placeholder="assets"
                    onChange={(event) => {
                      setRelativeDirectory(event.target.value)
                      setRelativeDirectoryError(null)
                    }}
                    onBlur={() => void saveRelativeDirectory()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        setRelativeDirectory(imageStorage.relativeDirectory)
                        setRelativeDirectoryError(null)
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <p
                    id="relative-image-directory-help"
                    className={cn(
                      'mt-2 text-xs leading-5',
                      relativeDirectoryError ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {relativeDirectoryError ?? '例如 assets、assets/images；使用 . 可保存到文档同目录。'}
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="global-image-directory" className="text-sm font-medium text-foreground">
                    全局目录
                  </label>
                  <div className="mt-2 flex flex-col gap-2 @min-[36rem]:flex-row">
                    <Input
                      id="global-image-directory"
                      value={imageStorage.globalDirectory ?? ''}
                      readOnly
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSavingImageSettings}
                      onClick={() => void selectGlobalDirectory()}
                    >
                      <FolderOpen />
                      选择文件夹
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    全局目录使用绝对文件链接，移动文档后仍会引用此目录。
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">正在加载图片设置...</p>
          )}
        </div>
      </div>
    ),
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
