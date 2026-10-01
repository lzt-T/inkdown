import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ProxyMode, ProxySettings } from '../../../../../shared/contracts'

interface ProxyModeOption {
  value: ProxyMode
  label: string
}

// Proxy modes retain a stable order in the connection control.
const PROXY_MODE_OPTIONS: ProxyModeOption[] = [
  { value: 'system', label: 'settings.follow-system' },
  { value: 'direct', label: 'settings.direct' },
  { value: 'manual', label: 'settings.manual-proxy' }
]

/** Renders and applies application-wide network proxy settings. */
export function ProxySettingsSection(): React.JSX.Element {
  // 订阅语言变更，使当前界面文案同步刷新。
  useTranslation()

  // Persisted proxy settings provide the comparison baseline for unsaved edits.
  const [proxy, setProxy] = useState<ProxySettings | null>(null)
  // Selected mode can change independently until the user saves it.
  const [mode, setMode] = useState<ProxyMode>('system')
  // Server input retains the last manual value across mode changes.
  const [server, setServer] = useState('')
  // Server validation feedback stays adjacent to its input.
  const [serverError, setServerError] = useState<string | null>(null)
  // Pending state prevents overlapping proxy changes.
  const [isSaving, setIsSaving] = useState(false)
  // Any changed field enables the explicit save action.
  const isDirty = Boolean(proxy && (mode !== proxy.mode || server !== proxy.server))

  /** Saves the current proxy form and applies the canonical main-process response. */
  const saveProxy = async (): Promise<void> => {
    if (!proxy || isSaving || !isDirty) return
    if (mode === 'manual' && !server.trim()) {
      setServerError(t('settings.enter-a-proxy-address'))
      return
    }

    setIsSaving(true)
    setServerError(null)
    try {
      // Main-process validation returns the exact settings active in both network sessions.
      const state = await window.api.settings.set({ proxy: { mode, server } })
      setProxy(state.proxy)
      setMode(state.proxy.mode)
      setServer(state.proxy.server)
      toast.success(t('settings.proxy-settings-applied'))
    } catch (error) {
      // Manual-mode failures are shown beside the server field and in the global toast.
      const message = error instanceof Error ? error.message : String(error)
      if (mode === 'manual') setServerError(message)
      toast.error(t('settings.proxy-settings-were-not-updated'), { description: message })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    // Mounted guard prevents late IPC responses from updating a closed settings page.
    let mounted = true
    void window.api.settings
      .get()
      .then((state) => {
        if (!mounted) return
        setProxy(state.proxy)
        setMode(state.proxy.mode)
        setServer(state.proxy.server)
      })
      .catch((error) => {
        toast.error(t('settings.unable-to-load-proxy-settings'), { description: String(error) })
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">{t('settings.network')}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('settings.configure-network-connections-for-inkdown-updates-github-image-storage-and-in-app-tra')}</p>

      <div className="mt-7">
        <h3 className="text-sm font-medium text-foreground">{t('settings.proxy-mode')}</h3>
        {proxy ? (
          <div className="mt-3 flex flex-col items-start gap-5">
            <div
              role="group"
              aria-label={t('settings.proxy-mode')}
              className="inline-grid grid-cols-3 rounded-md bg-muted p-1"
            >
              {PROXY_MODE_OPTIONS.map((option) => {
                // Pressed state reflects the current unsaved selection.
                const isSelected = mode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => {
                      setMode(option.value)
                      setServerError(null)
                    }}
                    className={cn(
                      'rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(option.label)}
                  </button>
                )
              })}
            </div>

            {mode === 'manual' && (
              <div className="w-full max-w-2xl border-y py-5">
                <div>
                  <label htmlFor="proxy-server" className="text-sm font-medium text-foreground">{t('settings.proxy-server')}</label>
                  <Input
                    id="proxy-server"
                    value={server}
                    disabled={isSaving}
                    aria-invalid={Boolean(serverError)}
                    aria-describedby="proxy-server-help"
                    className="mt-2"
                    placeholder="http://127.0.0.1:7890"
                    onChange={(event) => {
                      setServer(event.target.value)
                      setServerError(null)
                    }}
                  />
                  <p
                    id="proxy-server-help"
                    className={cn(
                      'mt-2 text-xs leading-5',
                      serverError ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {serverError ?? t('settings.supports-http-https-socks4-and-socks5-an-explicit-port-is-required')}
                  </p>
                </div>
              </div>
            )}

            <Button
              type="button"
              disabled={isSaving || !isDirty}
              onClick={() => void saveProxy()}
            >
              {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}{t('settings.save-and-apply')}</Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('settings.loading-proxy-settings')}</p>
        )}
      </div>
    </div>
  )
}
