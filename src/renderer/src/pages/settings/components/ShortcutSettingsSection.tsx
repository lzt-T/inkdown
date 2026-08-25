// 快捷键分组集中描述设置页需要展示的文件与视图操作。
const SHORTCUT_GROUPS = [
  {
    value: 'file',
    label: '文件',
    shortcuts: [
      { label: '新建文件', keys: ['N'] },
      { label: '打开文件', keys: ['O'] },
      { label: '打开文件夹', keys: ['Shift', 'O'] },
      { label: '保存', keys: ['S'] },
      { label: '另存为', keys: ['Shift', 'S'] },
      { label: '关闭标签页', keys: ['W'] }
    ]
  },
  {
    value: 'view',
    label: '视图',
    shortcuts: [
      { label: '切换文件树', keys: ['B'] },
      { label: '切换大纲', keys: ['Shift', 'E'] },
      { label: '切换源码模式', keys: ['/'] },
      { label: '切换主题', keys: ['Shift', 'T'] }
    ]
  }
] as const

// 主修饰键按照当前桌面平台显示为 Command 或 Ctrl。
const PRIMARY_MODIFIER = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

/** 展示 Inkdown 当前支持的固定快捷键。 */
export function ShortcutSettingsSection(): React.JSX.Element {
  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">快捷键</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        查看 Inkdown 当前支持的快捷键，快捷键暂不支持自定义。
      </p>

      <div className="mt-7 max-w-2xl space-y-7">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.value} aria-labelledby={`shortcut-group-${group.value}`}>
            <h3
              id={`shortcut-group-${group.value}`}
              className="text-sm font-medium text-foreground"
            >
              {group.label}
            </h3>
            <dl className="mt-3 divide-y border-y">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex min-h-12 items-center justify-between gap-4 py-3"
                >
                  <dt className="text-sm text-foreground">{shortcut.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    {[PRIMARY_MODIFIER, ...shortcut.keys].map((key, index) => (
                      <kbd
                        key={`${shortcut.label}-${key}-${index}`}
                        className="inline-flex min-w-7 items-center justify-center rounded-md border bg-muted px-2 py-1 font-sans text-xs font-medium text-muted-foreground shadow-xs"
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
