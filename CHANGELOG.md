# Changelog

## [0.3.6] - 2026-09-25

### 修复（对话运行中 Ctrl+Enter 插队发送不带引用）
- 现象：引用收好了、「引用 ×1」标签也在输入框旁，只要对话空闲时回车发送就能带上；可对话正在运行、用 Ctrl+Enter 插队发送时，发出去的消息只有自己打的文字，引用块压根没进消息。
- 根因（读宿主源码核对，非猜测）：v1.3.18 的修饰键守卫（issue #10）把「Cmd/Ctrl+Enter + 有文字草稿」整条交回 composer，`shouldAttachForEnter` 直接判定不拼稿——引用块从未写进草稿，自然随消息发不出去。这条守卫的意图是别抢宿主的 Queue / Steer 策略，但实现把拼稿也一起禁了。
- 修复（op72–op80）：拼稿与接管提交解耦。Cmd/Ctrl+Enter 与裸 Enter 一样把引用块拼进草稿；带文字时事件放行 composer，由宿主 `resolveSubmitMode` 决定 Queue / Steer（issue #10 原意保持），引用块随草稿一起由宿主提交。只有「纯引用空草稿」仍由插件接管直发 `submit('queue')`（issue #17 语义保持：composer 的 accelerated 空草稿路径在「运行中 + 有排队消息」时走 steerQueue 而不发送草稿）。
- 回归测试：「Cmd/Ctrl+Enter 带文字插队：拼稿并交回 composer」与「Cmd/Ctrl+Enter 纯引用空草稿：接管直发 queue」各一条；对修复点做过反向变异（摘掉 attachWasPureQuote 条件），插队用例如预期变红，可证伪。
- 验证：78 条 op 对基座 ab594842 正序重放与产物字节级一致（`--expect` 通过）；`npm run check` 退出码 0；`npm test` 22/22 通过。

### 补录（本地未推送补丁重放至 0.3.5 基线）
- 原本地 op47-attach-debug（attachAndSend 静默早退可观测化，2c82cdd）因 0.3.4/0.3.5 改动了锚点区域，按新产物文本拆为 op66–op71 重新登记并重放：解析不到会话 id、同屏多 composer 歧义失败关闭（覆盖 op64 新闸）、scope 解析失败、shouldAttachForEnter 不拼稿、斜杠命令跳过共五条早退路径各补 `annDbgAttach` 告警，仅待发引用 >0 时打印，正常路径不刷屏。
- 验证：69 条 op 对基座 ab594842 正序重放与产物字节级一致（`--expect` 通过）；`npm run check` + `npm test` 全绿。

## [0.3.5] - 2026-09-18

修复（Agent Teams 多会话同屏 + rAF 泄漏）
- **引用拼稿不再可能写进错误会话**（op64，MAJOR）：开启官方 `dsh-experimental-agent-team-profile` / `-web-profile` 后，Team 面板可把 teammate 会话换进主视图，而右侧栏 `ui-subagent` 用 `renderFactorySlot('conversation.content', {variant:'embedded'})` 渲染**同一套** `[data-composer-card]`（对 continuable 子代理还是可写的），于是同屏出现多块 composer。`currentSessionId()` 只认主视图（`uiWorkspace.mainReference`），而宿主 DOM 没有把 composer 卡片绑定到会话的标记（无 `data-session`/`data-conversation`），**无法判定用户实际在敲哪一块**。因此 `attachAndSend` 在 composer 数 >1 时失败关闭：不拼稿、原样交回宿主发送——宁可少一次引用，也不把引用块写进错误会话的草稿。闸放在公共落点，一次覆盖回车与按钮两条发送路径。
- **两处 rAF 补 `disposed` 守卫**（op65 / op65b）：`focusComposer` 与 `onLayoutChange` 的 rAF 回调此前未守卫（op55-58 只覆盖了三个装饰函数）。插件自身卸载后 composer 仍 `connected`，原 `isConnected` 守卫拦不住，会 `focus` + `selectAllChildren` 改宿主焦点/选区。
- 已知未做：引用编号（`.dsh-ann-num`，z 940）与 chip/tip（1150/1160）仍高于 Team 面板（z-index 110），面板打开时可能遮挡其顶部并吃掉点击。压低层级会牵动本插件与宿主弹层的既有相对关系（见 2026-08-14e 的 z-index 取舍注释），正解需 `elementFromPoint` 遮挡判定 + 真浏览器实测，本轮未做。
- 验证：63 条 op 逆序重放回基座每条恰好命中 1 次、正序重放与产物字节级一致（141,624 B）；`npm run check` 0；`npm test` 全绿。

## [0.3.4] - 2026-09-18

### 修复（实盘缺陷：技能斜杠命令带不走引用）
- 现象：选中助手文字存好引用，再输入 `/human-writing 全部修复` 回车。消息正常发出去了，引用却没跟上，输入框旁「1 条引用」一直挂着。
- 根因（说人话）：插件把「一切以 `/` 开头的输入」一律当成宿主命令，怕拼稿把命令弄坏，就干脆不带引用、只弹一条提示。技能调用长得也像命令，可它的参数本来就是随便写的文本，引用块跟在命令后面不会弄坏任何东西。上游当初担心的是「`/goal` 这类真命令被引用块顶掉 token 前缀」，那条对真命令仍然成立，对技能属于误伤。
- 修复：斜杠草稿先拿首 token 去宿主的技能清单（`remote.skills`，和官方技能插件同一个数据源）里查。查到就把纯引用块追加在命令之后一起发出（命令前缀原样保留，块用无「提问：」标记的 headOnly 形态，因为参数区不需要提问分隔）；查不到、或清单还没回来，就维持原行为（不带引用、引用留给下一条、toast 说明）。内建命令行为一字未改。
- 附带护栏：宿主输入机已经认领命令（从 `/` 菜单里选中命令，`phase` 处于 claimed/submitting/adjudicating 或 claim 在手）时绝不抢改草稿，不与宿主的命令声明打架。
- 依据（读宿主源码核对，非猜测）：`dsh-tool-skill` 的 `invokedSkillNames` 用 `SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g` 扫描用户消息的每个文本块，引用块后置不影响识别；`dsh-client-ui-conversation` 的输入机只在 `draft.trim().startsWith("/")` 时 adjudicate，未被认领的斜杠草稿最终经 `onAdjudicated → detachedEffects` 原样发出，token 留在文本里。技能名 token 判据与宿主 `SKILL_GESTURE` 同语法，不做超集匹配。
- 气泡配套（op63）：技能形态的引用块在命令之后、没有「提问：」标记，原来的气泡判图手术认不出来，会把整段协议文本留在你的气泡里、也贴不上「引用 ×N」标签。现在按「headOnly 起 + formatOnly 收尾」定位尾部块，切掉协议文本、保留命令原文。
- 实现：op50–op54、op63。清单按会话拉取、60 秒内复用，fiber 启动、引用集变化（保存成功／删除／恢复，落在 `updateChip`）、会话切换三处刷新；请求异步，卸载时 `abort`。服务用 `ctx.get('remote.skills')` 可选查询而非写进 `exports.inject`：该服务由 `dsh-api-gateway` 按命名空间动态挂载（`new Service(ctx, 'remote.' + ns)`），未挂载时压根不存在，硬注入会让整个引用插件跟着不加载（cordis「Required: the plugin does not load while the service is absent」），代价远大于「这一条不带引用」的保守回退。`inject` 保持 3 项不变。

### 清理（2026-09-18 官方规范审查发现逐条处理）
- **MAJOR-1** README 自述三处陈旧（09-02 同型回归）：中英 README 版本号 → v0.3.4、op 条数 34 → 60、PATCH 范围改为「`2026-08-14` 起，批次以 `grep -o "PATCH([^)]*)" client.js | sort -u` 为准」，「上游 tag」措辞修正为「上游 commit」。另在 `npm test` 加一条文档一致性断言（README 版本 == `package.json`、README op 条数 == `manifest.opsCount`、`opsCount` == `ops.length`），让这类漂移变成测试失败而不是靠人记。
- **MINOR-1** 编辑卡「删除引用」硬编码中文（`client.js:1458`）→ 改走 `t('edit.delete')`，zh/en 字典各补 key（op47–op49）。
- **MINOR-2** apply disposer 漏清空定时器 → 补清 `toastTimer`／`hoverGrace`／`assistantDecorateTimer`，新增 `disposed` 卸载守卫（`scheduleAssistantDecorate`／`decorateAssistantAnnotations`／`decorateAll` 三处先判），toast 的定时器摘除时顺手删掉它自己的节点（否则提示条永久留在 body 上），in-flight 技能清单请求 `abort`（op55–op59）。回归测试：卸载后拖尾定时器不得再往宿主助手行插芯片（做过反向变异验证会红）。
- **MINOR-3** `tipLayer` 监听器随芯片/标签数量无界累积 → 悬停宽限统一交给单例 `scheduleHide`/`cancelHide`（共享 `hoverGrace`），每枚回复芯片与每个气泡标签不再各自往 `tipLayer` 挂监听器、也不再各自持有 grace 定时器（op60–op62）。顺带消掉 MINOR-2 清单里的两类悬挂定时器，测试断言 `tipLayer` 上只剩一对监听器。
- **MINOR-4** 与上游同名的 loader entry id → 本包 `cordis.patch.yml` 的 insert id 由 `dsh-annotation` 改为 `dsh-annotation-patched`。改前先只读核对 `~/.dsh/profiles/web/cordis.patch.yml` 与 base/web-app/headless/home 四层：profile 层没有以该 id 写的裸条目（只有注释），改名安全。此后与上游包同时安装不再撞 duplicate loader entry。README「已知边界」补写迁移提示（按旧 id 写过覆盖条目的人需一起改名）。
- **INFO-1** `scripts/apply-patches.mjs` 的 op 重放从 `String.replace(find, replace)` 改为 `split/join`，消除 replace 文本含 `$&`/`$'`/`$1` 时被静默展开的潜伏工具坑（与术语改名步骤统一写法）。改后旧 43 条 op 重放仍与提交字节一致。
- **INFO-3** Node 支持区间落差（`engines: >=20` vs jsdom 30 要求 `>=22.22.2`）→ 按轻的做法：README 维护段写明「跑本仓测试需 Node ≥22.22.2，`engines: >=20` 只约束 DSH 宿主运行时」，`engines` 不动（宿主运行时区间是有意声明）。
- **INFO-2 / INFO-4 / INFO-5 / INFO-6 / INFO-7 / INFO-8 / INFO-9 / INFO-10** 记为可接受或已缓解，不改代码：INFO-2 未提交 lockfile 与 actions 按 tag 固定属个人仓库常规做法，CI 注释已如实披露离线门禁；INFO-4 外部 DOM 型 bundle 无 CSS Modules 通道，主体色已走 `--dsw-*` 令牌、字面量仅作 fallback，注入的 `<style>` 由宿主 `removeOwnedStyles` 纳管；INFO-5 装饰/改写既有行不属于 `ConversationNodeDefinition` 的贡献业务行通道，DOM 强耦合已在 README 披露且保留 `data-streaming` 守卫；INFO-6 `dsh.sessions.current` 回退带 `snap.ids` 交叉校验与一次性响亮 `console.warn`，属防御性设计；INFO-7 `cordis` peer 是与上游对齐的框架兼容区间，非运行时 import；INFO-8 CHANGELOG 不入 tarball 属发布卫生（files 七项与运行面一致，README 无死链）；INFO-9 factory 期注入的 style 不属 fiber 资源，不进 disposer 是对的；INFO-10 已由本版的 dispose 行为断言覆盖（从「不抛」升级为「卸载后无 DOM 改动」）。

### 验证
- `node scripts/apply-patches.mjs --fetch ab594842 --out <tmp> --expect client.js`：terminology 106 处、60/60 op、0 失配、与提交字节级一致 ✓
- `npm run check`（`node --check index.mjs && node --check client.js`）退出码 0；`node --check scripts/apply-patches.mjs`、`node --check test/client-load.test.mjs` 同为 0
- `npm test`：20/20 通过（新增 10 条：技能拼稿 5 条 + 气泡手术 1 条 + dispose 1 条 + tipLayer 监听器 1 条 + i18n 1 条 + 文档一致性 1 条）。其中「技能拼稿」「dispose 后无 DOM 改动」「气泡手术」三组做过反向变异（把修复点改掉），确认会红而非空跑
- 测试桩补齐：`makeCtx` 支持注入假 `remote.skills` 服务与 composer 输入机快照（phase/claim）、locale 桩；沙箱补 `AbortController`/`performance`；jsdom 缺 `ResizeObserver` 补空实现（否则 `updateChip` 在测试里抛错，chip 文案断言无从谈起）
- `npm pack --dry-run`：7 文件，交付面不变
## [0.3.3] - 2026-09-17

### 对齐（客户端依赖声明跟随上游 v1.4.11）
- `dsh.client.inject` 从只声明 `@deepseek-ai/dsh-client-ui-conversation` 补齐为 `@deepseek-ai/dsh-client-ui-session` + `@deepseek-ai/dsh-client-ui-conversation` + `@deepseek-ai/dsh-client-locale`（插件实际注入的 cordis 服务是 sessions/conversation/locale，与上游 1.4.11 声明一致）。
- `peerDependencies` 从已不满足的 `@deepseek-ai/dsh-client-runtime` / `@deepseek-ai/dsh-client-ui-conversation` `^0.1.0-rc.6` 改为上游同款 `cordis: ^4.0.0-rc.7 || ^4.0.1`。
- 客户端依赖图在宿主启动时合成，本项改动需重启宿主后生效（与 0.3.1/0.3.2 的热重载改动不同）。
## [0.3.2] - 2026-09-17

### 修复（回车拼稿吞掉用户自己输入的文字）
- 现象：先打字、再收集引用、然后回车——发出去了，但前端气泡里只剩「引用 ×1」，用户自己输入的文字消失。
- 根因（0.3.0 的 op13 引入）：为适配上游 v1.4.11 的「无标记纯引用块」补剥，写成了「stripOldBlock 没改动草稿，就把草稿整块置空」。而草稿里根本没有残留块（用户正常打字）同样会命中该分支，于是把用户正在输入的文字一并丢掉。
- 修复（op46）：补剥只在草稿确实以引用块首句（我引用了以下 / I annotated the following）开头时进行，且剥不动就保持原样，不再无条件置空。
- 验证：重放 43/43 op、0 失配、字节级可复现；`npm run check` 通过；`npm test` 10/10（新增回归：回车拼稿不得吞掉用户已输入的文字）。
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
