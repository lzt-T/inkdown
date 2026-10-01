import { t } from './i18n'
import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/contracts'

/** 根据当前语言构建原生菜单并保留原有角色和快捷键。 */
export function installApplicationMenu(sendAction: (action: MenuAction) => void): void {
  // 平台决定保留的系统菜单结构。
  const isMac = process.platform === 'darwin'

  /** 构建发送固定应用命令的菜单项。 */
  const send = (action: MenuAction): MenuItemConstructorOptions => ({
    label: labelFor(action),
    click: () => sendAction(action)
  })

  // 菜单骨架沿用既有业务操作。
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: t('native.files'),
      submenu: [
        { ...send('new-file'), accelerator: 'CmdOrCtrl+N' },
        { ...send('open-file'), accelerator: 'CmdOrCtrl+O' },
        { ...send('open-workspace'), accelerator: 'CmdOrCtrl+Shift+O' },
        { type: 'separator' },
        { ...send('save'), accelerator: 'CmdOrCtrl+S' },
        { ...send('save-as'), accelerator: 'CmdOrCtrl+Shift+S' },
        { type: 'separator' },
        { ...send('close-tab'), accelerator: 'CmdOrCtrl+W' },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: t('native.edit'),
      submenu: [
        { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'F12' }
      ]
    },
    {
      label: t('native.view'),
      submenu: [
        { ...send('toggle-sidebar'), accelerator: 'CmdOrCtrl+B' },
        { ...send('toggle-outline'), accelerator: 'CmdOrCtrl+Shift+E' },
        { ...send('toggle-source'), accelerator: 'CmdOrCtrl+/' },
        { ...send('toggle-theme'), accelerator: 'CmdOrCtrl+Shift+T' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: t('native.window'),
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(localizeRoles(template)))
}

/** 为应用控制的系统角色补充当前语言的标签。 */
function localizeRoles(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.map((item) => ({
    ...item,
    ...(item.role ? { label: t(`native.role-${item.role}`, { app: app.name }) } : {}),
    ...(Array.isArray(item.submenu) ? { submenu: localizeRoles(item.submenu) } : {})
  }))
}

/** 返回当前语言对应的应用命令标签。 */
function labelFor(action: MenuAction): string {
  // 命令键使用固定映射，翻译在菜单构建时读取。
  const labels: Record<MenuAction, string> = {
    'open-workspace': t('native.open-folder'),
    'open-file': t('native.open-file'),
    'new-file': t('native.new-file'),
    save: t('native.save'),
    'save-as': t('native.save-as'),
    'close-tab': t('native.close-tab'),
    'toggle-sidebar': t('native.toggle-sidebar'),
    'toggle-outline': t('native.toggle-outline'),
    'toggle-source': t('native.toggle-source-mode'),
    'toggle-theme': t('native.toggle-theme')
  }
  return labels[action]
}

