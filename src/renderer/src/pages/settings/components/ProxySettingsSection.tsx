import { useTranslation } from 'react-i18next'
import { t } from '@/lib/i18n'
import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatErrorMessage } from '@/lib/error-message'
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
  useTranslation()

  const [proxy, setProxy] = useState<ProxySettings | null>(null)
  const [mode, setMode] = useState<ProxyMode>('system')
  const [server, setServer] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isDirty = Boolean(proxy && (mode !== proxy.mode || server !== proxy.server))

  /** 将主进程返回的代理配置同步到表单状态。 */
  const applyLoadedProxy = useCallback((nextProxy: ProxySettings): void => {
    setLoadError(null)
    setProxy(nextProxy)
    setMode(nextProxy.mode)
    setServer(nextProxy.server)
  }, [])

  /** 手动重试加载网络代理配置。 */
  const handleRetryLoad = (): void => {
    setLoadError(null)
    void window.api.settings
      .get()
      .then((state) => {
        applyLoadedProxy(state.proxy)
      })
      .catch((error) => {
        const message = formatErrorMessage(error)
        setLoadError(message)
        toast.error(t('settings.unable-to-load-proxy-settings'), { description: message })
      })
  }

  /** 持久化并立即应用指定代理模式与地址。 */
  const persistProxy = async (nextMode: ProxyMode, nextServer: string): Promise<void> => {
    if (isSaving) return
    if (nextMode === 'manual' && !nextServer.trim()) {
      setServerError(t('settings.enter-a-proxy-address'))
      return
    }

    setIsSaving(true)
    setServerError(null)
    try {
      const state = await window.api.settings.set({
        proxy: { mode: nextMode, server: nextServer }
      })
      setProxy(state.proxy)
      setMode(state.proxy.mode)
      setServer(state.proxy.server)
      toast.success(t('settings.proxy-settings-applied'))
    } catch (error) {
      const message = formatErrorMessage(error)
      if (nextMode === 'manual') setServerError(message)
      toast.error(t('settings.proxy-settings-were-not-updated'), { description: message })
    } finally {
      setIsSaving(false)
    }
  }

  /** 切换到系统/直连模式时即时应用，无需二次点击保存按钮。 */
  const handleModeChange = (nextMode: ProxyMode): void => {
    setMode(nextMode)
    setServerError(null)
    if (nextMode !== 'manual' && proxy && proxy.mode !== nextMode) {
      void persistProxy(nextMode, server)
    }
  }

  useEffect(() => {
    let mounted = true
    void window.api.settings
      .get()
      .then((state) => {
        if (!mounted) return
        applyLoadedProxy(state.proxy)
      })
      .catch((error) => {
        if (!mounted) return
        const message = formatErrorMessage(error)
        setLoadError(message)
        toast.error(t('settings.unable-to-load-proxy-settings'), { description: message })
      })
    return () => {
      mounted = false
    }
  }, [applyLoadedProxy])

  return (
    <div>
      <header className="border-b pb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
          {t('settings.network')}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {t('settings.configure-network-connections-for-inkdown-updates-github-image-storage-and-in-app-tra')}
        </p>
      </header>

      <div className="py-5">
        <h3 className="text-[13px] font-medium text-foreground">{t('settings.proxy-mode')}</h3>
        {proxy ? (
          <div className="mt-3 flex flex-col items-start gap-5">
            <div
              role="group"
              aria-label={t('settings.proxy-mode')}
              className="inline-grid grid-cols-3 rounded-lg bg-muted p-1"
            >
              {PROXY_MODE_OPTIONS.map((option) => {
                const isSelected = mode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => handleModeChange(option.value)}
                    className={cn(
                      'inline-flex h-7 items-center justify-center rounded-md px-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs dark:bg-card'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(option.label)}
                  </button>
                )
              })}
            </div>

            {mode === 'manual' && (
              <div className="w-full max-w-lg space-y-4 rounded-xl border bg-card/50 p-4">
                <div>
                  <label htmlFor="proxy-server" className="text-[13px] font-medium text-foreground">
                    {t('settings.proxy-server')}
                  </label>
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
                    role={serverError ? 'alert' : undefined}
                    className={cn(
                      'mt-2 text-xs leading-5',
                      serverError ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {serverError ??
                      t('settings.supports-http-https-socks4-and-socks5-an-explicit-port-is-required')}
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="text-[13px]"
                  disabled={isSaving || !isDirty}
                  onClick={() => void persistProxy(mode, server)}
                >
                  {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {t('settings.save-and-apply')}
                </Button>
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
          <p className="mt-3 text-[13px] text-muted-foreground">{t('settings.loading-proxy-settings')}</p>
        )}
      </div>
    </div>
  )
}
