# Changelog

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
