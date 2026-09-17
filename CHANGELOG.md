# Changelog

## [0.3.1] - 2026-09-17

### 修复（DSH 0.1.6 会话接口漂移导致引用发不出去）
- 现象：划词保存引用后 chip 常驻输入框右上角，回车 / Ctrl+Enter / 点发送按钮三条路径都不把引用块带进消息，控制台零 `[annotation]` 输出。
- 根因（实测，非猜测）：DSH 0.1.6 起 `sessions` 服务的线上 provider 是 `dsh-api-session-controller` 的 `ClientSessions`，其 `list` 快照只有 `ids/byId/phase/subagentsByParent/jobsBySession`，源码注释写明 view selection remains outside the Controller——旧字段 `sessions.list.getSnapshot().current` **恒为 undefined**。插件在 `attachAndSend` 第一行就静默 `return false`；`writePendingQuotes` 拿不到会话 id 导致待发送引用永不落盘；`watchInputDraft` 订阅永不建立导致发送后 chip 永不清空。
- 修复：新增统一解析器 `currentSessionId()`（op38），按「老宿主快照 `current` → `uiWorkspace.mainReference` 视图层当前会话 → `uiWorkspace.selection` 持久化选择单元 → 宿主自己写的 `localStorage[dsh.sessions.current]`」取会话 id，并在全部 8 处取用处替换（op39–op45）。解析失败时一次性 `console.warn`，不再静默。
- 验证：`node scripts/apply-patches.mjs --fetch ab594842 --out client.js` → 42/42 op、0 失配、字节级可复现；`npm run check` 通过；`npm test` 9/9 通过（新增两条回归：快照无 `current` 时回退 localStorage、以及回退 uiWorkspace）。
## [0.3.0] - 2026-09-17

### 升级（基座迁移到上游 v1.4.11-preview.1，适配 DSH 0.1.6）
- 宿主 DSH 从 0.1.5-rc.1 升到 0.1.6-alpha.2，composer 换成 Lexical contenteditable；旧基座 fd24ef92（v1.4.1 + issue#20）在 0.1.6 上出现「引用收下但发不出去、chip 常驻输入框」故障。基座迁移到上游 v1.4.11-preview.1（tag ab594842，2026-09-15，上游说明「适配 DSH 0.1.6-alpha.1」）。
- 上游同期把包名从 `@omdsh-dev/dsh-annotation` 改为 `@changfenhuang/dsh-annotation`（loader id、报错注释、exports.name 三处）。
- 重放：`node scripts/apply-patches.mjs --fetch v1.4.11-preview.1 --out client.js --expect client.js` → terminology 106 处、34/34 op 应用、0 失配、字节级一致 ✓。`node --check client.js` 过，`npm test` 7/7 过。

### 适配（11 条锚点；只改 find 与紧邻上下文，PATCH 语义与标记不变）
- op00 / op20 包名 id：上游改名 @changfenhuang，find 的域名前缀随之更新。
- op13 `attachAndSend`：上游改为 `buildBlock(hasQuestion)` 并把 `annotationAttached` 拆进 `hasAnnotationBlock` 分支；stripOldBlock「剥离后重拼」语义保留，另补剥上游新增的无标记纯引用块（headOnly/formatOnly）。
- op15 / op16 / op17 chip 定位：上游 updateChip 自带 observedComposer/composerObserver（只观察 card）与视口可见性守卫；fork 的 observeChipComposer 观察 card + `[data-input-scroll]` + 输入面并挂 input 事件，find 吞掉上游重复声明/观察块，保留上游守卫并追加动态测高定位。
- op21 / op22 消息流 observer：上游回调尾部新增 hasRowInsert/scheduleAssistantDecorate 限流分支；fork 只摘除 op03 注入的 chip 重定位块并注入 rootObserver/bindMessageObserver，上游限流分支原样保留。
- op23 回车守卫：上游改用 `[data-composer-input]`；fork 的 `isComposerEditor` 是超集（旧 textarea + 新 contenteditable），保留。
- op25 chip ResizeObserver 输入面：随 op15 恢复锚点后自动命中，无需改锚。
- op28 dispose：上游新增 inputWatchTimer 清理与 composerObserver.disconnect()；find 纳入前者，replace 用 rootObserver/observerTarget 收尾并移除已不存在的 composerObserver 行。

### 退休（4 条，上游已覆盖；证据与行号见 patches/manifest.json 的 retired）
- op04 点击发送按钮拼稿：上游新增 submitAttached/sendButtonOf/onSendPointerDown/onSendKeyboardClick（新基座 1226–1266 行），覆盖且更完整（含空草稿禁用按钮的直接提交路径）。
- op18 随 op04 退休：onDocClickCapture 不再注入，上游 dispose 自行移除自己的 pointerdown/click 监听（新基座 2325–2326 行）。
- op24 `focusComposer`：上游已改为面向 Lexical contenteditable 的等价实现（新基座 1646–1658 行，`[data-composer-input]` + isContentEditable + Range 折叠到文末）。
- op27 会话切换清 pendingDeco：上游订阅已自行作废发送暂存（新基座 2305–2307 行 `pendingDeco.length = 0`，并按会话恢复 pendingQuotes）。

### 测试
- `test/client-load.test.mjs` 按新基座调整两处断言（会话切换改认 `readPendingQuotes(cur)` + `pendingDeco.length = 0`；纯引用块无「提问：」标记，改认 `我引用了以下`），未删测试。7/7 通过。

## [0.2.3] - 2026-09-05

### 兼容（旧模型服务内联思考）
- 一些旧模型服务没有独立 reasoning 通道，把思考过程以 think / thinking / thought 标签块直接写进正文，宿主按普通文本渲染：助手回复里出现大段独白，且独白中若出现「Annotation N：」会被误替换成芯片。
- 修复：`decorateAssistantAnnotations` 在停流守卫后先跑 `stripInlineThink`（文本节点级块剥离，块被 markdown 拆成多节点时状态机跨节点续接），再走芯片逻辑。patches/manifest.json 追加组 `p0905-strip-think` 共 2 op（ops 36 → 38），fd24ef92 基座全量重放通过。
- 测试：`test/client-load.test.mjs` 新增 jsdom 回归（跨节点块剥离 + 独白内假 Annotation 不成芯片）。7/7 通过。

## [0.2.2] - 2026-09-03

### 修复（宽布局悬浮卡右边溢出）
- DSH web 中列可拉伸到很宽后，右对齐的用户气泡贴住屏幕右缘；hover「引用 ×N」标签 /「Annotation N」芯片 / 输入框旁引用标签时，展开卡片右侧溢出屏幕被裁。
- 根因：三处 tip 卡片 append 到 body 直下的 tipLayer，不带 `[data-annotation-for-dsh]`，不继承 border-box——content-box 下 `width:300/320px` + padding 24px + border 2px，实际外框比标称宽 26px，而水平钳位按标称宽算。
- 修复：tip cssText 补 `box-sizing:border-box`（×3），钳位改用实测外框宽 `el.offsetWidth`（×3，双保险）。patches/manifest.json 追加组 `p0903-tip-clamp` 共 7 op（ops 29 → 36），fd24ef92 基座全量重放 `--expect client.js` 字节级一致 ✓。

## [0.2.1] - 2026-09-01

### 修复（宿主 composer Lexical 化）
- 宿主 DSH 的输入框由 `<textarea>` 换成 Lexical `ComposerContentEditable`（`<div contenteditable="true">`）后，回车拼稿守卫 `ta instanceof HTMLTextAreaElement` 永不成立：引用块不随消息发出，且 `annotationAttached` 恒 false 导致「草稿变空即清空」的确认链也不触发——引用集与「N 条引用」chip 常驻。现改为 `isComposerEditor()` 统一判别，**textarea（旧宿主）与 contenteditable（新宿主机）都认**，向后兼容。
- `focusComposer()`：同样只认 textarea → 保存引用后不再自动聚焦。现两种输入面都聚焦（textarea 走 `setSelectionRange`，contenteditable 用 Range 折叠到文末）。
- chip 的 `ResizeObserver`：改观察 `textarea` 或 `[contenteditable="true"]`。

### 清单补录
- `patches/manifest.json`：补录 6c6dd18（2026-08-27，会话切换清 pendingDeco / observer 收敛 / 有界轮询）漏记的 4 组 op（group `p0827-flow-observer`），并追加本次 4 组 op（group `p0901-lexical-compat`）；ops 21 → 29。
- 全量重放校验通过：`node scripts/apply-patches.mjs --fetch fd24ef92 --out rebuilt.js --expect client.js` → 29/29 应用、字节级一致。

### 测试
- `test/client-load.test.mjs`：新增两条端到端回归（选区 → 引用 → 保存 → 回车拼稿），分别用 contenteditable 与 textarea 两种 composer 形态；退回旧守卫时 contenteditable 用例失败（可证伪）。6/6 通过。

## [0.2.0] - 2026-08-21

### 升级
- 基座 v1.3.13 → 上游 v1.4.1 + issue#20 修复（fd24ef92）：获得 locale 双语 UI（issue #11）、修饰键 Enter 守卫（#10）、Cmd/Ctrl+Enter 纯引用直发（#17）、斜杠命令不拼稿（#20）、rc.7/rc.8 兼容核查
- 新增 `scripts/apply-patches.mjs` + `patches/manifest.json`：fork 补丁全量可重放（术语改名 + 包名 + 21 条锚定 op），升级上游 = 一条命令 + 失配锚点适配

### 适配（5 处锚点）
- 工具条按钮 i18n 化：图标恒无保留，文案改走 `t()`；「可留空 = 仅引用原文」提示移入 zh/en 字典
- `attachAndSend(e)` 签名：点击发送按钮路径传合成事件对象 `{ ctrlKey:false, metaKey:false }`
- `stripOldBlock` 升级双语哨兵（`我引用了以下…提问：` / `I annotated the following…Ask:`），复用上游 `hasAnnotationBlock`
- `updateChip` 删除重复 card 查询的锚点随 `t('chip.count')` 行更新
- 导出尾部 `exports.name` 改单行锚点（上游新增 `exports.inject` 行）

### 测试
- `client-load.test.mjs` 断言跟进上游 inject 契约（sessions/conversation/locale）；3/3 通过

## [0.1.0] - 2026-08-14

- 基于 upstream v1.3.13 的初始 fork：全局术语改名（批注→引用）、单按钮制、发送确认制竞态修复、区域过滤防高亮盖输入栏、编辑态删除引用、塌缩残留选区、chip 动态重定位、点击发送按钮拼稿
