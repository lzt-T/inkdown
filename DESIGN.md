# Inkdown Design System

## 1. Visual Direction & Surface Mode

- **Mode**: Operate + Read（桌面端本地 Markdown 写作工作台）
- **Aesthetic**: 石墨纯墨工作台（Graphite Monochrome，中性灰阶层级 + 极少量钴蓝点缀）
- **Core Principles**:
  1. **表面明度分层优先于框线切割**：外围工具壳体（`--panel`）与写作画布（`--background`）采用同一纯中性灰阶家族的不同明度，避免多层 `1px` 边框与偏色选中块干扰阅读。
  2. **画布与壳体统一**：所见即所得（`zt-react-milkdown`）与源码模式（CodeMirror）共享同一画布底色、字体栈与版心尺寸，切换编辑模式零视觉跳变。
  3. **低噪渐进显隐**：单文档隐藏多标签栏、无活动文档隐藏状态栏、设置态隐藏编辑器专属顶栏操作；彩色仅留给文本选区、焦点环与未保存/更新点缀。

## 2. Color Tokens（WCAG AA Checked）

| Token | Light (`:root`) | Dark (`.dark`) | Role |
| --- | --- | --- | --- |
| `--background` | `#ffffff` | `#18191d` | 写作画布（源码模式共用）与设置内容底 |
| `--panel` | `#f4f4f6` | `#131417` | 标题栏、侧栏、多标签栏、状态栏 |
| `--card` / `--popover` | `#ffffff` | `#1e2026` | 弹窗、右键菜单、下拉选项、卡片 |
| `--muted` | `#ededf0` | `#21232a` | 分段控件轨道、快捷键 `<kbd>`、图标底托 |
| `--accent` | `#ebecf0` | `#24262e` | 悬停底色 |
| `--selected` | `#e6e7ec` | `#282a33` | 无色偏中性灰选中底（当前文件、大纲、设置导航） |
| `--foreground` | `#1b1d22` | `#eceef2` | 主文字 |
| `--muted-foreground` | `#5f6370` | `#8d919e` | 次级说明、路径、非激活图标（对比度 ≥ 4.6:1） |
| `--border` | `#e5e6eb` | `#272931` | 区域细分割线 |
| `--input` | `#d1d3dc` | `#363944` | 输入框、选择框与轮廓按钮描边 |
| `--primary` | `#18191d` | `#eceef2` | 主 CTA 墨色按钮与正文主操作（文字 `#ffffff` / `#141519`） |
| `--ring` / `--info` | `#2563eb` | `#5b9bff` | 焦点环、文本选区、未保存小圆点与更新点缀 |
| `--destructive` | `#dc2626` | `#e5484d` | 危险操作、删除确认、校验错误（文字 `--destructive-foreground: #ffffff`） |
| `--success` / `--warning` | `#15803d` / `#b45309` | `#3dd68c` / `#f5a623` | 已保存/已连接成功色、磁盘缺失警告色 |

## 3. Typography & Reading Measure

- **UI Font**: `--font-sans`（`'Geist Variable'` + 跨平台系统 CJK 无衬线回退）
- **Monospace Font**: `--font-mono`（`'Geist Mono Variable'` + 系统等宽回退）
- **UI Scale**: `11px` 状态栏 / `12px` 标题栏与标签 / `13px` 文件树与大纲 / `14px` 设置正文；数字计数统一开启 `tabular-nums`。
- **Editor Measure**: WYSIWYG（`zt-react-milkdown`）与源码模式（CodeMirror）编辑区最大内容宽度为 `900px`（窄容器下自动收缩水平内边距）。

## 4. Styling & Third-Party Editor Rules

- **Tailwind v4 Dark Mode**：`src/renderer/src/assets/globals.css` 声明 `@custom-variant dark (&:where(.dark, .dark *));`，暗色变体严格跟随 `.dark` 类而非系统媒体查询。
- **Base Cascade Protection**：全局通配符 `* { border-color: var(--border); ... }` 与元素基础规则必须位于 `@layer base` 内，严禁放在 `@layer` 之外覆盖 `@layer utilities`。
- **Milkdown Integration**：保留 `zt-react-milkdown` 原生 `--zt-*` 样式、内边距、字号与滚动条行为，应用层仅清除最外层 `.zt-md` 边框与圆角，使正文区严丝合缝贴合侧栏与底栏。

## 5. Shell Layout & Interaction Invariants

- **Titlebar**：仅保留高频入口（侧栏开关、新建、源码切换、主题切换、更新、设置、系统窗口控制）；进入设置页时隐藏所有编辑器操作按钮；所有图标按钮 Tooltip 附带当前平台快捷键。
- **Smart TabsBar**：`tabOrder.length <= 1` 时自动隐藏，单文档名与未保存状态居中展示于标题栏；`>= 2` 篇时展开标签栏，支持中键关闭与 `ArrowLeft`/`ArrowRight` 切换。
- **Data Safety**：任何关闭路径（标签关闭按钮、鼠标中键、`Ctrl/Cmd+W`）统一经由 `requestCloseTab` 检查未保存状态，弹窗提供“保存并关闭 / 不保存并关闭 / 取消”；外部删除文件时顶部渲染可恢复横幅（“重新保存到原路径” / “另存为”）。
- **Accessibility**：文件树具备 `role="tree"` / `treeitem` / `aria-expanded` / `aria-current` 与方向键 / `F2` / `Delete` 键盘操作；状态栏保存态使用 `role="status"`；表单内联错误使用 `role="alert"`。
