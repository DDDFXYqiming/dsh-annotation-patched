简体中文 | [English](README.en.md)

# dsh-annotation-patched

DSH Web「选中引用」插件的本地增强版（fork 维护，v0.2.0）。包名已改为独立 fork 包名 `@dsh-external/dsh-annotation-patched`，避免与上游发布冲突。

- **上游**：[omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation)（MIT，基座 v1.4.1 + issue#20 修复，commit fd24ef92，2026-08-21 升级重放）
- **本目录** = 上游代码 + 本地增强（`client.js` 内所有改动带日期 `PATCH(YYYY-MM-DD)` 标记，`grep` 可定位）
- **升级方式**：`node scripts/apply-patches.mjs --fetch <上游commit> --out client.js` 一键重放全部 fork 补丁（清单见 `patches/manifest.json`）

## 增强（相对上游 v1.3.13）

### 1. 空引用 = 引用（单按钮制）

选中助手消息文字 → 点「**引用**」→ 引用可留空直接保存 = 纯引用（仅标记原文），与 Codex 的 Add to chat 一致。工具栏仅保留「引用」按钮。**显式确认制**：任何选中动作（复制、双击阅读选词）都不会自动成为引用，必须点击「引用」按钮，杜绝幽灵引用。

### 2. 幽灵引用修复（发送确认制）

上游 `quotes`（待发送引用集）唯一清理路径在 `decorateAll` 装饰扫描轮询，存在竞态窗口：气泡未渲染、标记缺失或快速连发时 `quotes` 残留，导致之后没选中也附带旧引用。

`PATCH(2026-08-14c)` 最终方案：quotes 清理只认「发送确认」——`watchInputDraft`（草稿从有→空 = 发送完成）为主清理点，`decorateAll`（气泡出现）为兜底。新增 `stripOldBlock()`：拼稿前用正则剥离草稿残留的旧引用块，残留不再导致重复伴随也不再阻塞新引用拼稿。删除旧守卫（草稿含 block 即 return），消除「残留污染 → 引用永久卡死」路径。

### 3. 多行输入框布局修复

`引用 ×N` 标签是独立的 `position: fixed` 层，原先只在引用数量变化时定位一次；输入框自动增高后，标签会留在旧坐标并嵌入输入框。`PATCH(2026-08-17)` 起通过 `ResizeObserver`、输入事件和 composer 替换检测持续同步标签位置，确保多行输入时仍停在输入框上方。

### 4. 维护性

- 所有改动带 `PATCH(2026-08-14)` ~ `PATCH(2026-08-17)` 注释标记，上游更新时可快速定位 diff 重新套用
- **补丁重放工具**（v0.2.0 起）：`scripts/apply-patches.mjs` + `patches/manifest.json`——干净上游产物 → 全局术语改名（批注→引用）→ 包名替换 → 21 条锚定 op 逐条重放（每条锚文本必须恰好命中 1 次），失配即报错并列出适配指引
- 调试日志 `[annotation] 引用块已拼入草稿…` / 拼稿日志带发送条数（DevTools Console 可查）

## 安装

```bash
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# 本地开发时也可直接使用仓库目录
dsh plugin --profile web add <本目录>
```

## 已知边界

- 只支持选中**助手消息**（用户自己发的消息不处理）
- 自动引用在**回车发送**与**点击发送按钮**时均触发（`PATCH(2026-08-14d)` 起：capture 阶段拦截发送按钮先拼稿）
- 浏览器端插件：改动 `client.js` 后需 **Ctrl+F5 强刷**（或换浏览器）才生效；`pnpm` 更新会覆盖 `node_modules` 里的副本，须以本目录为源重新 link
- 强依赖 DSH Web DOM 结构（`[data-time-hover-root]`、`[class*="bubble"]`、`[data-composer-card]` 等），DSH UI 升级可能失效

## 升级记录

- v0.2.0：基座 v1.3.13 → v1.4.1(+issue#20)；5 处锚点适配——①工具条 i18n 化（文案走 t()，「可留空」提示进 zh/en 字典）②attachAndSend(e) 签名（点击路径传合成事件对象）③stripOldBlock 升级双语哨兵（zh 提问：/en Ask:）④updateChip 锚点随 t(chip.count) 更新⑤导出尾部单行锚点；测试断言跟进 inject + locale

## License

MIT（保留上游版权声明，见 LICENSE）
