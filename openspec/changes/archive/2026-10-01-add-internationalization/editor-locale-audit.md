# 编辑器语言切换能力核查

日期：2026-10-01。仅做源码与公开包核查，没有运行浏览器、项目脚本或动态编辑器检查。

## Milkdown

- 当前依赖 `zt-react-milkdown@0.1.30`：`dist/index.mjs:56432` 附近的 useMilkdownEditor 将 locale 放入 useEditor 工厂依赖；locale 变化会更新 editorFactory。
- 同一包 `dist/index.mjs:28` 附近的编辑器挂载 Effect 依赖 editorFactory，清理时调用 editor.destroy，随后创建新的编辑器。由此确认直接更新 locale 会重建实例，不能满足保留选区、滚动及撤销/重做历史的规格。
- 原生插件在构建时取得 messages，公开导出只有 MilkdownEditor 和相关类型，运行时句柄没有更新语言/文案方法。仅更新 messages 不能视为完整插件文案热更新方案。
- 用项目 pnpm 查询公开注册表得到最新版本 `0.1.31`，将其发布包下载到系统临时目录进行只读核查，未修改依赖、锁文件或 node_modules。
- 新版 `dist/index.mjs:68930` 仍将 locale 放入编辑器工厂依赖；其运行时类型也没有文案更新入口。直接升级不能解决该能力缺口。

## CodeMirror

- 已安装的 `@uiw/react-codemirror/esm/useCodeMirror.js:146` 附近通过 `StateEffect.reconfigure.of(getExtensions)` 更新扩展，扩展变化无需销毁 EditorView。
- 可将 `EditorState.phrases` 加入现有扩展用于语言更新；选区、滚动和撤销/重做保留仍需后续人工动态验收。

## 决策点

当前 Milkdown 封装不提供原设计所依赖的完整语言热更新能力。用户随后明确要求先不处理 Milkdown，继续本项目国际化，因此本次保留原依赖与固定语言参数。尝试的依赖补丁已撤回，Milkdown 修复不纳入当前任务；其内部文案在英文界面中仍保持中文。

任务 1.1 的能力核查完成；这不代表语言热切换或动态验收通过。
