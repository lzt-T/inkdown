import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/contracts'

export function installApplicationMenu(sendAction: (action: MenuAction) => void): void {
  const isMac = process.platform === 'darwin'

  const send = (action: MenuAction): MenuItemConstructorOptions => ({
    label: labelFor(action),
    click: () => sendAction(action)
  })

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
      label: '文件',
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
      label: '编辑',
      submenu: [
        { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: '视图',
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
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function labelFor(action: MenuAction): string {
  const labels: Record<MenuAction, string> = {
    'open-workspace': '打开文件夹',
    'open-file': '打开文件',
    'new-file': '新建文件',
    save: '保存',
    'save-as': '另存为',
    'close-tab': '关闭标签页',
    'toggle-sidebar': '切换文件树',
    'toggle-outline': '切换大纲',
    'toggle-source': '切换源码模式',
    'toggle-theme': '切换主题'
  }
  return labels[action]
}

