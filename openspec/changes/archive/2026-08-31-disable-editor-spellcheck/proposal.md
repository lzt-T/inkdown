## Why

Electron 当前为窗口启用了原生拼写检查，导致 Milkdown 编辑器中的随机文本、代码和非词典内容出现红色波浪线，容易被误认为 Markdown 或内容错误。所见即所得编辑器不需要该提示，应在编辑区域内关闭它。

## What Changes

- 仅在 Milkdown 所见即所得编辑器中关闭浏览器原生拼写检查。
- 移除普通文本、行内代码和代码块中的原生拼写错误波浪线。
- 保持应用其他输入控件及源码编辑器的现有行为不变。

## Capabilities

### New Capabilities

- `editor-spellcheck`: 规定所见即所得 Markdown 编辑器的原生拼写检查行为及影响范围。

### Modified Capabilities

无。

## Impact

- 影响 Milkdown 编辑器渲染组件及其 ProseMirror 编辑根节点。
- 不改变 Markdown 内容、保存格式、渲染结果、公共 API 或依赖。
- 不改变 Electron 窗口级拼写检查设置，避免扩大修改范围。
