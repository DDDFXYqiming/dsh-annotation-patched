简体中文 | [English](README.en.md)

# dsh-annotation-patched

DSH Web「选中引用」插件的本地增强版（fork 维护，v0.3.4）。包名已改为独立 fork 包名 `@dsh-external/dsh-annotation-patched`，发出去不会和上游的发布撞名。

插件做的事很具体。你在 DSH Web 里选中助手消息中的文字，点「引用」，想补一句说明就写上，不想写就留空，然后回车发送。引用块会拼进你的消息一起发出去，模型按编号逐条回应每条引用，回应里带有可以悬停展开的引用标记。

- 上游是 [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation)（MIT，上游 v1.4.11 起包名改为 `@changfenhuang/dsh-annotation`）。本 fork 的基座为 v1.4.11-preview.1，对应上游 commit `ab594842`（2026-09-15，上游说明「适配 DSH 0.1.6-alpha.1」；2026-09-17 迁移重放）。历史基座：v1.4.1 + issue#20 = `fd24ef92`
- 本目录的内容就是上游代码加本地增强。`client.js` 里所有改动都带 `PATCH(YYYY-MM-DD)` 标记，`grep` 一下就能全部定位
- 升级基座时跑 `node scripts/apply-patches.mjs --fetch <上游commit> --out client.js`，全部 fork 补丁按 `patches/manifest.json` 清单一键重放

## 增强（本地定制，相对上游 v1.4.11-preview.1）

### 1. 空引用 = 引用（单按钮制）

选中助手消息的文字，点「**引用**」，引用内容可以留空直接保存，得到一条纯引用（只在原文上做标记），用法和 Codex 的 Add to chat 一样。工具栏只保留「引用」一个按钮。选中动作是显式确认制，复制、双击读词这类操作都不会自动变成引用，必须真的点下「引用」按钮，没点过按钮的幽灵引用就不会出现。

### 2. 幽灵引用修复（发送确认制）

上游的 `quotes`（待发送引用集）只有一条清理路径，藏在 `decorateAll` 装饰扫描轮询里。这里有竞态窗口，气泡还没渲染、标记缺失或者快速连发时，`quotes` 会留下残留，之后没选中任何文字的消息也会带上旧引用。

`PATCH(2026-08-14c)` 的最终方案是让清理只认发送确认。`watchInputDraft`（草稿从有到空即发送完成）做主清理点，`decorateAll`（气泡出现）做兜底。新增的 `stripOldBlock()` 在拼稿前用正则把草稿里残留的旧引用块剥掉，残留既不会造成重复伴随，也不会阻塞新引用的拼稿。旧守卫（草稿含 block 即 return）已删除，残留导致引用永久卡死的路径随之消失。

### 3. 多行输入框布局修复

`引用 ×N` 标签单独占一个 `position: fixed` 层，原先只在引用数量变化时定位一次。输入框自动增高之后，标签留在旧坐标上，会嵌进输入框。`PATCH(2026-08-17)` 起改用 `ResizeObserver`、输入事件和 composer 替换检测持续同步标签位置，多行输入时标签也停在输入框上方。

### 4. 旧模型服务内联 think 剥离（v0.2.3）

一些旧模型服务没有独立 reasoning 通道，把思考过程以 think / thinking / thought 标签块直接写进正文。`PATCH(2026-09-05)` 起，助手回复停流后这些块会从文本节点剥掉（块被 markdown 拆成多节点时状态机跨节点续接），独白里出现的「Annotation N：」也不会再被误做成芯片。

### 5. 斜杠技能调用也带引用（v0.3.4）

选中助手文字存成引用，再打 `/human-writing 全部修复` 回车，引用块现在会跟着这条消息一起发出去。技能的 `/名字` 手势收的是自由文本，所以引用块追加在命令后面：既不破坏命令 token 前缀，也不会被当成宿主命令参数消费（宿主 dsh-tool-skill 本来就是扫整条用户消息里的 `/名字` 来加载技能的）。内建命令（`/goal`、`/model` 这类）仍按上游 issue #20 处理：原样发出、不带引用，你的引用保留到下一条消息，界面有一条 toast 说明。判定依据是宿主的 `remote.skills` 技能清单（按会话拉取、60 秒内复用、拿不到就退回上面的保守行为）。

### 6. 维护性

- 所有改动都带 `PATCH(YYYY-MM-DD[组名])` 注释标记（`2026-08-14` 起，当前批次列表以 `client.js` 里的 `grep -o "PATCH([^)]*)" client.js | sort -u` 为准），上游更新时能快速定位 diff 重新套用
- 补丁重放工具（v0.2.0 起）由 `scripts/apply-patches.mjs` 和 `patches/manifest.json` 组成，流程是取干净上游产物，做全局术语改名（批注→引用）和包名替换，再逐条重放 60 条锚定 op（另有 4 条因上游 v1.4.11 已覆盖而退休，记录在 manifest 的 `retired`）。每条锚文本必须恰好命中 1 次，失配就报错并列出适配指引
- 调试日志 `[annotation] 引用块已拼入草稿…`、`[annotation] 斜杠技能 xxx 已随消息追加引用…` 和拼稿日志（带发送条数）都能在 DevTools Console 里看到
- 跑本仓测试需要 Node `>=22.22.2`（devDependency jsdom 30 的要求）；`package.json` 里的 `engines: >=20` 只约束 DSH 宿主运行时，不表示 Node 20 能跑这里的 jsdom 测试
- README 自述的版本号与 op 条数由 `npm test` 里的文档一致性断言与 `package.json` / `patches/manifest.json` 比对，防再次抄漏

## 安装

```bash
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# 本地开发时也可直接使用仓库目录
dsh plugin --profile web add <本目录>
```

## 已知边界

- 只支持选中**助手消息**，用户自己发的消息不处理
- 自动引用在**回车发送**和**点击发送按钮**时都会触发。点按钮路径自 v0.3.0 起由上游 v1.4.11 的 `onSendPointerDown`/`onSendKeyboardClick` 处理（fork 的同名补丁已退休），仍会在 capture 阶段先拼稿
- 这是浏览器端插件，改了 `client.js` 后需要 **Ctrl+F5 强刷**（或者换个浏览器）才生效。`pnpm` 更新会覆盖 `node_modules` 里的副本，须以本目录为源重新 link
- 强依赖 DSH Web 的 DOM 结构（`[data-time-hover-root]`、`[class*="bubble"]`、`[data-composer-card]` 等），DSH UI 升级可能让它失效
- 斜杠技能带引用依赖宿主的 `remote.skills` 服务（与官方技能插件同一个数据源，未注入、由 `ctx.get` 可选查询）。服务未挂载、清单还没拉回或拉取失败时，那一条按上游保守行为处理（不带引用、引用留给下一条）
- v0.3.4 起本包的 loader entry id 为 `dsh-annotation-patched`（与上游包的 `dsh-annotation` 区分，两者同时安装不再撞 duplicate loader entry）。若你在 profile 层按旧 id 写过覆盖条目，改名时要一起改

## 升级记录

- v0.3.0 的基座从 v1.4.1（fd24ef92）升到 v1.4.11-preview.1（ab594842）以适配 DSH 0.1.6 的 Lexical composer。11 条锚点适配（包名 id、attachAndSend、chip 定位、消息流 observer、回车守卫、dispose），4 条退休（点击发送按钮拼稿、其 dispose 清理、focusComposer、会话切换清 pendingDeco，均被上游自身实现覆盖）。重放 34/34 无失配、字节级一致，7/7 测试通过
- v0.2.0 的基座从 v1.3.13 升到 v1.4.1（含 issue#20），适配了 5 处锚点。①工具条 i18n 化，文案走 `t()`，可留空提示进 zh/en 字典。②`attachAndSend(e)` 签名变化，点击路径传合成事件对象。③`stripOldBlock` 升级双语哨兵，zh 用 `提问：`、en 用 `Ask:`。④`updateChip` 锚点随 `t(chip.count)` 更新。⑤导出尾部改成单行锚点。测试断言跟进 inject 与 locale 的变化

## License

MIT（保留上游版权声明，见 LICENSE）
