import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import 'zt-react-milkdown/style.css'
import './assets/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initialSettings, rendererI18n, syncDocumentLanguage } from '@/lib/i18n'
import { useEditorStore } from '@/store/editor-store'

/** 初始化语言后挂载应用，避免首次展示发生语言跳变。 */
async function mountApplication(): Promise<void> {
  // 主进程启动快照提供语言与历史恢复设置。
  const settings = await initialSettings
  await rendererI18n.init({ lng: settings.resolvedLocale })
  syncDocumentLanguage()
  useEditorStore.getState().setTheme(settings.theme)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
    </StrictMode>
  )
}

void mountApplication()
