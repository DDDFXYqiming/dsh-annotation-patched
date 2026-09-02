简体中文 | [English](README.en.md)

# dsh-annotation-patched

DSH Web「选中引用」插件的本地增强版（fork 维护，v0.2.1）。包名已改为独立 fork 包名 `@dsh-external/dsh-annotation-patched`，发出去不会和上游的发布撞名。

插件做的事很具体。你在 DSH Web 里选中助手消息中的文字，点「引用」，想补一句说明就写上，不想写就留空，然后回车发送。引用块会拼进你的消息一起发出去，模型按编号逐条回应每条引用，回应里带有可以悬停展开的引用标记。

- 上游是 [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation)（MIT）。本 fork 的基座为 v1.4.1 加 issue#20 修复，对应上游 commit fd24ef92（2026-08-21 升级重放）
- 本目录的内容就是上游代码加本地增强。`client.js` 里所有改动都带 `PATCH(YYYY-MM-DD)` 标记，`grep` 一下就能全部定位
- 升级基座时跑 `node scripts/apply-patches.mjs --fetch <上游commit> --out client.js`，全部 fork 补丁按 `patches/manifest.json` 清单一键重放

## 增强（相对上游 v1.3.13）

### 1. 空引用 = 引用（单按钮制）

选中助手消息的文字，点「**引用**」，引用内容可以留空直接保存，得到一条纯引用（只在原文上做标记），用法和 Codex 的 Add to chat 一样。工具栏只保留「引用」一个按钮。选中动作是显式确认制，复制、双击读词这类操作都不会自动变成引用，必须真的点下「引用」按钮，没点过按钮的幽灵引用就不会出现。

### 2. 幽灵引用修复（发送确认制）

上游的 `quotes`（待发送引用集）只有一条清理路径，藏在 `decorateAll` 装饰扫描轮询里。这里有竞态窗口，气泡还没渲染、标记缺失或者快速连发时，`quotes` 会留下残留，之后没选中任何文字的消息也会带上旧引用。

`PATCH(2026-08-14c)` 的最终方案是让清理只认发送确认。`watchInputDraft`（草稿从有到空即发送完成）做主清理点，`decorateAll`（气泡出现）做兜底。新增的 `stripOldBlock()` 在拼稿前用正则把草稿里残留的旧引用块剥掉，残留既不会造成重复伴随，也不会阻塞新引用的拼稿。旧守卫（草稿含 block 即 return）已删除，残留导致引用永久卡死的路径随之消失。

### 3. 多行输入框布局修复

`引用 ×N` 标签单独占一个 `position: fixed` 层，原先只在引用数量变化时定位一次。输入框自动增高之后，标签留在旧坐标上，会嵌进输入框。`PATCH(2026-08-17)` 起改用 `ResizeObserver`、输入事件和 composer 替换检测持续同步标签位置，多行输入时标签也停在输入框上方。

### 4. 维护性

- 所有改动都带 `PATCH(2026-08-14)` 到 `PATCH(2026-08-17)` 的注释标记，上游更新时能快速定位 diff 重新套用
- 补丁重放工具（v0.2.0 起）由 `scripts/apply-patches.mjs` 和 `patches/manifest.json` 组成，流程是取干净上游产物，做全局术语改名（批注→引用）和包名替换，再逐条重放 29 条锚定 op。每条锚文本必须恰好命中 1 次，失配就报错并列出适配指引
- 调试日志 `[annotation] 引用块已拼入草稿…` 和拼稿日志（带发送条数）都能在 DevTools Console 里看到

## 安装

```bash
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# 本地开发时也可直接使用仓库目录
dsh plugin --profile web add <本目录>
```

## 已知边界

- 只支持选中**助手消息**，用户自己发的消息不处理
- 自动引用在**回车发送**和**点击发送按钮**时都会触发（`PATCH(2026-08-14d)` 起，capture 阶段拦截发送按钮先拼稿）
- 这是浏览器端插件，改了 `client.js` 后需要 **Ctrl+F5 强刷**（或者换个浏览器）才生效。`pnpm` 更新会覆盖 `node_modules` 里的副本，须以本目录为源重新 link
- 强依赖 DSH Web 的 DOM 结构（`[data-time-hover-root]`、`[class*="bubble"]`、`[data-composer-card]` 等），DSH UI 升级可能让它失效

## 升级记录

- v0.2.0 的基座从 v1.3.13 升到 v1.4.1（含 issue#20），适配了 5 处锚点。①工具条 i18n 化，文案走 `t()`，可留空提示进 zh/en 字典。②`attachAndSend(e)` 签名变化，点击路径传合成事件对象。③`stripOldBlock` 升级双语哨兵，zh 用 `提问：`、en 用 `Ask:`。④`updateChip` 锚点随 `t(chip.count)` 更新。⑤导出尾部改成单行锚点。测试断言跟进 inject 与 locale 的变化

## License

MIT（保留上游版权声明，见 LICENSE）
