import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useCallback, useEffect, useState } from 'react'
import { Check, FolderOpen, GitBranch, KeyRound, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatErrorMessage } from '@/lib/error-message'
import { cn } from '@/lib/utils'
import type {
  GitHubImageStorageStatus,
  ImageStorageMode,
  ImageStorageSettings
} from '../../../../../shared/contracts'

// Image storage labels map fixed strategy keys to visible names.
const IMAGE_STORAGE_MODE_LABELS: Record<ImageStorageMode, string> = {
  relative: 'settings.relative-to-document',
  global: 'settings.global-directory',
  github: 'settings.github-image-storage'
}
// Ordered storage modes keep the segmented control stable.
const IMAGE_STORAGE_MODES: ImageStorageMode[] = ['relative', 'global', 'github']

/** Renders local and GitHub image storage configuration. */
export function ImageSettingsSection(): React.JSX.Element {
  useTranslation()

  const [imageStorage, setImageStorage] = useState<ImageStorageSettings | null>(null)
  const [selectedMode, setSelectedMode] = useState<ImageStorageMode>('relative')
  const [githubStatus, setGitHubStatus] = useState<GitHubImageStorageStatus | null>(null)
  const [relativeDirectory, setRelativeDirectory] = useState('assets')
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [relativeDirectoryError, setRelativeDirectoryError] = useState<string | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  /** 将主进程返回的图片配置快照同步到组件状态。 */
  const applyLoadedSettings = useCallback(
    (state: { imageStorage: ImageStorageSettings }, status: GitHubImageStorageStatus): void => {
      setLoadError(null)
      setImageStorage(state.imageStorage)
      setSelectedMode(state.imageStorage.mode)
      setRelativeDirectory(state.imageStorage.relativeDirectory)
      setGitHubStatus(status)
      if (status.settings) {
        setRepository(`${status.settings.owner}/${status.settings.repository}`)
      }
    },
    []
  )

  /** 手动重试加载图片存储配置。 */
  const handleRetryLoad = (): void => {
    setLoadError(null)
    void Promise.all([window.api.settings.get(), window.api.image.getGitHubStatus()])
      .then(([state, status]) => {
        applyLoadedSettings(state, status)
      })
      .catch((error) => {
        const message = formatErrorMessage(error)
        setLoadError(message)
        toast.error(t('settings.unable-to-load-image-settings'), { description: message })
      })
  }

  /** Persists image settings and applies normalized values from the main process. */
  const persistImageStorage = async (next: ImageStorageSettings): Promise<boolean> => {
    setIsSaving(true)
    try {
      const state = await window.api.settings.set({ imageStorage: next })
      setImageStorage(state.imageStorage)
      setSelectedMode(state.imageStorage.mode)
      setRelativeDirectory(state.imageStorage.relativeDirectory)
      setRelativeDirectoryError(null)
      return true
    } catch (error) {
      toast.error(t('settings.image-storage-settings-were-not-updated'), {
        description: formatErrorMessage(error)
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  /** Selects and persists a global directory after native confirmation. */
  const selectGlobalDirectory = async (): Promise<void> => {
    if (!imageStorage || isSaving) return
    const directory = await window.api.image.selectDirectory()
    if (!directory) return
    await persistImageStorage({ ...imageStorage, mode: 'global', globalDirectory: directory })
  }

  /** Selects a storage strategy while deferring unconfigured GitHub activation. */
  const changeImageStorageMode = async (mode: ImageStorageMode): Promise<void> => {
    if (!imageStorage || isSaving) return
    setGithubError(null)
    if (mode === 'github' && (!githubStatus?.settings || !githubStatus.hasToken)) {
      setSelectedMode('github')
      return
    }
    if (mode === 'global' && !imageStorage.globalDirectory) {
      await selectGlobalDirectory()
      return
    }
    if (imageStorage.mode !== mode) await persistImageStorage({ ...imageStorage, mode })
    else setSelectedMode(mode)
  }

  /** Saves the relative directory or restores the last accepted value. */
  const saveRelativeDirectory = async (): Promise<void> => {
    if (!imageStorage || isSaving || relativeDirectory === imageStorage.relativeDirectory) return
    const isSaved = await persistImageStorage({ ...imageStorage, relativeDirectory })
    if (isSaved) {
      toast.success(t('settings.relative-directory-saved'))
      return
    }
    setRelativeDirectory(imageStorage.relativeDirectory)
    setRelativeDirectoryError(t('settings.enter-a-relative-directory-without-an-absolute-path-or'))
  }

  /** Validates, securely stores, and activates the configured public GitHub repository. */
  const configureGitHub = async (): Promise<void> => {
    if (!imageStorage || isSaving) return
    if (!repository.trim()) {
      setGithubError(t('settings.enter-a-github-repository-url'))
      return
    }
    if (!githubStatus?.hasToken && !token.trim()) {
      setGithubError(t('settings.enter-a-github-token-with-write-access-to-contents'))
      return
    }

    setIsSaving(true)
    setGithubError(null)
    try {
      const status = await window.api.image.configureGitHub({
        repository,
        token: token.trim() || null
      })
      setGitHubStatus(status)
      setImageStorage({ ...imageStorage, mode: 'github', github: status.settings })
      setSelectedMode('github')
      setToken('')
      toast.success(t('settings.github-image-storage-enabled'))
    } catch (error) {
      const message = formatErrorMessage(error)
      setGithubError(message)
      toast.error(t('settings.github-image-storage-configuration-failed'), { description: message })
    } finally {
      setIsSaving(false)
    }
  }

  /** Clears repository metadata and the encrypted credential from this device. */
  const clearGitHub = async (): Promise<void> => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const next = await window.api.image.clearGitHub()
      setImageStorage(next)
      setSelectedMode(next.mode)
      setGitHubStatus({ settings: null, hasToken: false })
      setRepository('')
      setToken('')
      setGithubError(null)
      setConfirmClearOpen(false)
      toast.success(t('settings.github-image-storage-configuration-cleared'))
    } catch (error) {
      toast.error(t('settings.unable-to-clear-github-image-storage-configuration'), {
        description: formatErrorMessage(error)
      })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    let mounted = true
    void Promise.all([window.api.settings.get(), window.api.image.getGitHubStatus()])
      .then(([state, status]) => {
        if (!mounted) return
        applyLoadedSettings(state, status)
      })
      .catch((error) => {
        if (!mounted) return
        const message = formatErrorMessage(error)
        setLoadError(message)
        toast.error(t('settings.unable-to-load-image-settings'), { description: message })
      })
    return () => {
      mounted = false
    }
  }, [applyLoadedSettings])

  return (
    <div>
      <header className="border-b pb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
          {t('settings.images')}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {t('settings.choose-where-new-images-are-saved-existing-images-will-stay-in-place')}
        </p>
      </header>

      <div className="py-5">
        <h3 className="text-[13px] font-medium text-foreground">{t('settings.storage-location')}</h3>
        {imageStorage ? (
          <div className="mt-3 space-y-5">
            <div
              role="group"
              aria-label={t('settings.image-storage-mode')}
              className="inline-grid grid-cols-3 rounded-lg bg-muted p-1"
            >
              {IMAGE_STORAGE_MODES.map((mode) => {
                const isSelected = selectedMode === mode
                const isActiveStrategy = imageStorage.mode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => void changeImageStorageMode(mode)}
                    className={cn(
                      'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs dark:bg-card'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span>{t(IMAGE_STORAGE_MODE_LABELS[mode])}</span>
                    {isActiveStrategy && (
                      <span
                        title={t('settings.currently-active')}
                        aria-label={t('settings.currently-active')}
                        className="size-1.5 shrink-0 rounded-full bg-success"
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {selectedMode === 'relative' && (
              <div>
                <label
                  htmlFor="relative-image-directory"
                  className="text-[13px] font-medium text-foreground"
                >
                  {t('settings.relative-directory')}
                </label>
                <Input
                  id="relative-image-directory"
                  value={relativeDirectory}
                  disabled={isSaving}
                  aria-invalid={Boolean(relativeDirectoryError)}
                  aria-describedby="relative-image-directory-help"
                  className="mt-2 block max-w-md"
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
                  role={relativeDirectoryError ? 'alert' : undefined}
                  className={cn(
                    'mt-2 text-xs leading-5',
                    relativeDirectoryError ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {relativeDirectoryError ??
                    t('settings.for-example-assets-or-assets-images-use-to-save-beside-the-document')}
                </p>
              </div>
            )}

            {selectedMode === 'global' && (
              <div>
                <label
                  htmlFor="global-image-directory"
                  className="text-[13px] font-medium text-foreground"
                >
                  {t('settings.global-directory-2')}
                </label>
                <div className="mt-2 flex max-w-lg flex-col gap-2 @min-[28rem]:flex-row">
                  <Input
                    id="global-image-directory"
                    value={imageStorage.globalDirectory ?? ''}
                    readOnly
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[13px]"
                    disabled={isSaving}
                    onClick={() => void selectGlobalDirectory()}
                  >
                    <FolderOpen />
                    {t('settings.choose-folder')}
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t(
                    'settings.global-storage-uses-absolute-file-links-that-remain-unchanged-when-the-document-moves'
                  )}
                </p>
              </div>
            )}

            {selectedMode === 'github' && (
              <div className="max-w-lg space-y-4 rounded-xl border bg-card/50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <GitBranch className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      {t('settings.public-github-repository')}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {t(
                        'settings.new-images-are-committed-to-images-year-month-and-linked-with-public-raw-urls-in-mark'
                      )}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="github-image-repository"
                    className="text-[13px] font-medium text-foreground"
                  >
                    {t('settings.repository')}
                  </label>
                  <Input
                    id="github-image-repository"
                    value={repository}
                    disabled={isSaving}
                    className="mt-2"
                    placeholder="owner/repository"
                    onChange={(event) => {
                      setRepository(event.target.value)
                      setGithubError(null)
                    }}
                  />
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t('settings.use-owner-repository-or-https-github-com-owner-repository')}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="github-image-token"
                    className="text-[13px] font-medium text-foreground"
                  >
                    {t('settings.github-token-label')}
                  </label>
                  <div className="relative mt-2">
                    <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="github-image-token"
                      type="password"
                      value={token}
                      disabled={isSaving}
                      autoComplete="off"
                      className="pl-8"
                      placeholder={
                        githubStatus?.hasToken
                          ? t('settings.leave-blank-to-keep-the-saved-token')
                          : 'github_pat_…'
                      }
                      onChange={(event) => {
                        setToken(event.target.value)
                        setGithubError(null)
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t(
                      'settings.the-token-needs-write-access-to-the-repository-s-contents-and-is-encrypted-locally-us'
                    )}
                  </p>
                </div>

                {githubError && (
                  <p role="alert" className="text-xs leading-5 text-destructive">
                    {githubError}
                  </p>
                )}

                {githubStatus?.settings && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {githubStatus.hasToken ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <KeyRound className="size-3.5 text-destructive" />
                    )}
                    {githubStatus.hasToken
                      ? t('settings.connected')
                      : t('settings.credentials-unavailable')}{' '}
                    {githubStatus.settings.owner}/{githubStatus.settings.repository}{' '}
                    {t('settings.branch')} {githubStatus.settings.branch}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="text-[13px]"
                    disabled={isSaving}
                    onClick={() => void configureGitHub()}
                  >
                    {isSaving ? <LoaderCircle className="animate-spin" /> : <GitBranch />}
                    {githubStatus?.settings
                      ? t('settings.save-and-enable')
                      : t('settings.connect-and-enable')}
                  </Button>
                  {githubStatus?.settings && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[13px] hover:border-destructive/40 hover:text-destructive"
                      disabled={isSaving}
                      onClick={() => setConfirmClearOpen(true)}
                    >
                      <Trash2 />
                      {t('settings.clear-configuration')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : loadError ? (
          <div role="alert" className="mt-3 flex items-center gap-3 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="xs" onClick={handleRetryLoad}>
              <RefreshCw />
              {t('settings.retry')}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">{t('settings.loading-image-settings')}</p>
        )}
      </div>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <div className="flex items-start gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </div>
            <AlertDialogHeader className="min-w-0 flex-1">
              <AlertDialogTitle>{t('settings.clear-github-confirm-title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('settings.clear-github-confirm-description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>{t('workspace.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault()
                void clearGitHub()
              }}
            >
              {t('settings.clear-configuration')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
