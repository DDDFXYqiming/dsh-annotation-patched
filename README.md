简体中文 | [English](README.en.md)

# dsh-annotation-patched

DSH Web「选中引用」插件的本地增强版（fork 维护）。

## 来源

- 上游项目：[omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation)（MIT License，v1.3.13）
- 上游能力：选中助手回复文字 → 引用（可留空）→ 回车随消息发送；模型按 `Annotation N:` 逐条对照回复（回复中为可悬停芯片）；引用块不出现在自己的气泡里（零闪烁隐藏）
- 本目录为上游代码 + 本地增强（client.js 内所有改动均带日期 `PATCH(...)` 标记，可 `grep` 定位）

## 增强内容（相对上游 v1.3.13）

### 1. 空引用 = 引用（单按钮制）

选中助手消息文字 → 点「**引用**」→ 引用可留空直接保存 = 纯引用（仅标记原文），与 Codex 的 Add to chat 一致。

- 工具栏仅保留「引用」按钮（v2026-08-14c 起移除临时加的「空引用」按钮——空引用由引用按钮的 `note=''` 路径承担，功能等价）
- **显式确认制**：任何选中动作（复制、双击阅读选词）都不会自动成为引用——必须点击「引用」按钮（杜绝幽灵引用）
- 同文本去重沿用上游规则（已在清单中的文字按钮禁用）
- 曾尝试「选中即自动引用」方案（选中即暂存快照、回车自动消费），实测误触发严重（复制/阅读选中即被引用），已废弃并回退为按钮制（v2026-08-14b）

### 2. 幽灵引用修复（拼稿即清 → 发送确认制）

上游 `quotes`（待发送引用集）唯一清理路径在 `decorateAll` 装饰扫描轮询（等气泡渲染 → 切引用块 → 贴标签全部成功才清空），存在竞态窗口：气泡未渲染、标记缺失或快速连发时 `quotes` 残留，导致之后没选中也附带旧引用。

v2026-08-14 曾改为「拼稿即清」（`attachAndSend` 里 setDraft 后立即清空），但引入新竞态：**清空时机早于发送确认**——

- 现象 A（引用丢失）：拼稿后 quotes 已清，但 composer 提交的是旧草稿（IME 合成、焦点转移、React 状态未刷新等）→ 消息没带引用，quotes 也丢了
- 现象 B（重复伴随）：拼稿后提交失败 → 草稿残留「我引用了以下…」块，quotes 已空 → 下一条普通消息带着残留块发出；且旧守卫 `draft.indexOf('我引用了以下') !== -1` 让后续引用永远拼不进去

**v2026-08-14c 最终方案**：

- `attachAndSend` 不再拼稿即清——**quotes 清理只认「发送确认」**：`watchInputDraft`（草稿从有→空 = 发送完成）为主清理点，`decorateAll`（气泡出现）为兜底
- 新增 `stripOldBlock()`：拼稿前用正则（`/\n*我引用了以下[\s\S]*?\n\n提问：(?:\n+)?/g`）剥离草稿中残留的旧引用块，再拼新块——残留不再导致重复伴随，也不阻塞新引用拼稿
- 删除旧守卫（草稿含 block 即 return），消除「残留污染 → 引用永久卡死」路径

### 3. 多行输入框布局修复

- `引用 ×N` 标签是独立的 `position: fixed` 层，原先只在引用数量变化时定位一次；输入框自动增高后，标签会留在旧坐标并嵌入输入框。
- `PATCH(2026-08-17)` 起通过 `ResizeObserver`、输入事件和 composer 替换检测持续同步标签位置，确保多行输入时仍停在输入框上方。

### 4. 维护性

- 所有改动带 `PATCH(2026-08-14)` ~ `PATCH(2026-08-17)` 注释标记，上游更新时可快速定位 diff 重新套用
- 调试日志 `[annotation] 引用块已拼入草稿…` / 拼稿日志带发送条数（DevTools Console 可查）

## 安装

从 GitHub 安装（推荐）：

```bash
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# 本地开发时也可直接使用仓库目录
dsh plugin --profile web add <本目录>
```

## 已知边界

- 只支持选中**助手消息**（用户自己发的消息不处理）
- 自动引用在**回车发送**与**点击发送按钮**时均触发（PATCH(2026-08-14d) 起：capture 阶段拦截发送按钮先拼稿）
- 浏览器端插件：改动 `client.js` 后需 **Ctrl+F5 强刷**（或换浏览器）才生效；**pnpm 更新会覆盖** node_modules 里的副本，须以本目录为源重新 link
- 强依赖 DSH Web DOM 结构（`[data-time-hover-root]`、`[class*="bubble"]`、`[data-composer-card]` 等），DSH UI 升级可能失效

## 维护标记

- 本 fork 所有改动带 `PATCH(2026-08-14)` ~ `PATCH(2026-08-14e)` 注释标记（grep `PATCH(2026-08-14` 可全部定位），上游更新时可快速 diff 重新套用
- 包名已改为独立 fork 包名 `@dsh-external/dsh-annotation-patched`（v0.1.0），避免与上游 `@omdsh-dev/dsh-annotation` 发布冲突

## License

MIT（保留上游版权声明，见 LICENSE）
