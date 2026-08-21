# Changelog

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
