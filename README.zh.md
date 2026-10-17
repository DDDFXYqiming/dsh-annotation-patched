---
description: "选中助手回复里的一段文字，带可选说明随消息发出，模型按编号逐条回应。"
kind: "package-bundle"
---

# @dsh-external/dsh-annotation-patched

[English](README.md) | 中文

## 概述

`dsh-annotation-patched` v0.3.7 给 DSH Web 加上划词标注。在助手回复里选中一段文字，写一条可选的说明，按回车就能把标注块随消息一起发出。模型按编号逐条回应，回复里的每个编号都能悬停查看原文和说明。待发送的标注按会话存在浏览器里，刷新页面也不会丢，发送或删除后才消失。

## 目录

- [安装](#installation)
- [使用](#usage)
- [配置](#configuration)
- [实现机制](#how-the-plugin-works)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="installation"></a>
## 安装

把包加进 web profile。从 GitHub 安装时执行下面的命令。

```bash
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
```

本地开发时，克隆仓库、装开发依赖，再把目录加进 profile。

```bash
git clone https://github.com/DDDFXYqiming/dsh-annotation-patched.git
cd dsh-annotation-patched
npm install
dsh plugin --profile web add .
```

profile 的组合层在 DSH 启动时应用。装完先重启 DSH，再在 Web 页面按 Ctrl+F5 强刷，让浏览器取到当前的 client bundle。

这个包只作用于 Web 客户端。Node 入口只注册插件身份，`apply` 是空实现，真正的功能在浏览器端通过 client module 加载。

-----

<a id="usage"></a>
## 使用

1. 在助手回复里选中一段文字，选区旁会出现一个浮动工具栏，上面只有一个「引用」按钮。
2. 点「引用」，写一条说明，或者留空只引用原文，然后保存。
3. 原文会亮起编号和高亮，输入框上方出现「引用 ×N」标签。悬停标签可以查看全部待发内容，点编号能改说明，编辑器里可以删除某一条。
4. 用回车、发送按钮，或者对话运行中的 Ctrl+Enter 发出。插件会在宿主提交之前把标注块拼到消息前面。
5. 模型被要求按 `Annotation 1` 到 `Annotation N` 逐条回应。回复停流后，每个编号都会变成可以悬停的小标签，悬停能看到引用的原文和说明。
6. 用 `/human-writing 全部修复` 这类斜杠技能时，标注块会追加在命令后面一起发出，宿主仍然能从消息里认出技能名。`/goal`、`/model` 这类内建命令不带标注块，界面弹一条 toast，说明标注保留给下一条消息。

待发送的标注按会话存在浏览器里，刷新后会恢复。发送会清空它们，在标签编辑器里删掉的条目也会从待发列表里移除。

-----

<a id="configuration"></a>
## 配置

插件的配置来自宿主和 profile 条目。

- 界面语言跟随 DSH 的 locale 服务，`zh` 和 `en` 都支持，locale 服务缺失时回退到 `zh`。标注块和界面用同一种语言。
- 待发送的标注存在浏览器 localStorage 里，键名是 `dsh.annotation.pending.v1.<sessionId>`。
- 要停用插件，可以从 profile 里移除这个包，也可以在 profile 补丁层按 loader 条目 id `dsh-annotation-patched` 禁用它。

-----

<a id="how-the-plugin-works"></a>
## 实现机制

<details>
<summary>实现细节（点击展开）</summary>

`index.mjs` 是 Node half，只导出包名和空的 `apply`，真正的功能都在浏览器端。

`client.js` 是手写的 CommonJS bundle，用 `window.__ModuleLoader__.load` 注册，注册 id 必须等于包名。bundle 自己渲染 DOM，不导入任何 `@deepseek-ai` 值，通过 cordis 服务拿到 `sessions`、`conversation` 和 `locale`。

`cordis.patch.yml` 在 profile 层插入 loader 条目 `dsh-annotation-patched`，条目 `name` 指向包名。这个 id 和上游的 `dsh-annotation` 区分开，两个包可以同时安装。后续 profile 补丁可以按 id 覆盖或禁用这个条目。

选区捕获由 `selectionchange` 触发。保存时会记下消息锚 key、文本偏移、前后文、引用原文和说明，待发列表按会话写进 localStorage，原文上再叠一层绝对定位的高亮和编号。

发送路径在 capture 阶段监听回车、Ctrl/Cmd+Enter 和发送按钮的 pointerdown 与 click。提交前先用 `stripOldBlock` 剥掉草稿里残留的旧块，再把协议块拼到最前面。纯引用的空草稿由插件直接 `submit('queue')`，草稿里有文字时事件交回 composer，由宿主决定 Queue 还是 Steer。IME latch 保证输入法上屏那一次回车不会误触发拼稿。

清理只认发送确认。草稿从有内容变成空才清空待发标注，装饰扫描做兜底，残留块不会跟到下一条消息。

回复装饰在流式结束、`data-streaming` 移除之后进行。插件先剥掉内联 think 块，再把 `Annotation N` 标签换成芯片，条目数据取最近一条带标注的用户消息。宿主重建插队消息气泡时，对应的行会再装饰一次。

同屏出现多块 `[data-composer-card]` 时插件放弃拼稿。composer 的 DOM 不携带会话标记，插件无法判断用户正在敲哪一块，只把草稿原样交回宿主发送。

斜杠草稿会拿首 token 去 `remote.skills` 清单里查，清单缓存 60 秒。命中技能就在命令后面追加 headOnly 块，内建命令维持原样。

维护方面，`patches/manifest.json` 记录 81 条锚定 op，`scripts/apply-patches.mjs` 在全局术语改名之后把这些 op 重放到干净的上游 `client.js` 上。每条锚文本必须恰好命中一次，上游变化会让工具报错退出，避免静默套错。`--expect` 可以和已知良好产物做字节比对。

测试方面，`npm run check` 检查入口文件的语法，`npm test` 走 node 自带的 test 模块和 jsdom，跑离线的 DOM 回归。

排障时在浏览器 Console 里过滤 `[annotation]`，能看到拼稿、技能追加、回复芯片装饰和早退原因，有待发标注的早退会带上条数。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`cordis.patch.yml`](cordis.patch.yml)，profile 层和 loader 条目 id。
- [`scripts/apply-patches.mjs`](scripts/apply-patches.mjs)，上游换基座时的重放工具。
- [`patches/manifest.json`](patches/manifest.json)，术语映射和锚定 op 清单。
- [`test/client-load.test.mjs`](test/client-load.test.mjs)，离线 jsdom 回归测试。
- [上游仓库](https://github.com/omdsh-dev/dsh-annotation)，本 fork 基于的划词标注插件。

-----

<a id="model-experience"></a>
## 模型体验

模型看到的是用户消息开头的一段纯文本标注块，标注信息全部在这段文本里。一条带标注、后面还有追问的消息长这样。

```
我引用了以下 1 处内容（编号与原文对应），请针对它们回答我的问题：

1. <引用的原文>
   引用：<你的说明>

请用「Annotation 1：…」到「Annotation 1：…」的格式，逐条回应上面每一条引用，最后再回答我的问题。

提问：
<你自己打的文字>
```

纯引用消息的空草稿用短形态，不带提问行的分隔标记。

```
我引用了以下内容，请逐条回应：

1. <引用的原文>

请按「Annotation N：…」的格式，逐条回应以上引用。
```

回复正文里保留 `Annotation N` 标签。客户端只在 DOM 里把它们换成芯片，会话记录里还是模型原样输出的文本。

#### KV Cache 影响

标注块属于一条用户消息的正文，只发送一次，不重复注入，也不改写已有消息。回复里的芯片只是 DOM 显示，不产生请求内容。provider 的前缀缓存按新消息的正常方式延续。切换 DSH 界面语言只影响切换之后拼出的标注块。

-----

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- 只能给助手回复划词，用户自己发的消息不参与标注。
- 插件依赖 DSH Web 的 DOM 属性，例如 `[data-chat-flow-kind="assistant-step"]`、`[data-composer-card]`、`[data-composer-input]` 和 `[data-chat-anchor-key]`。DSH UI 一改，选区捕获、拼稿或芯片装饰都可能失效。
- 同屏出现多块 composer 时（Agent Teams 面板、内嵌子代理视图），插件无法判断每块 composer 属于哪个会话，于是放弃拼稿，消息照常发出。
- 斜杠技能带标注依赖 `remote.skills` 清单。服务未挂载、清单还没回来或拉取失败时，这一条不带标注，标注留到下一条。内建斜杠命令一律不带标注，只弹一条 toast。
- 内联 think 剥离只认文本节点里的 `<think>`、`<thinking>`、`<thought>` 和 `<reasoning>` 标签。宿主渲染层如果把标签当 HTML 吃掉，只剩思考文字，插件就无从识别。
- 待发标注存在浏览器 localStorage 里，不跨浏览器或设备同步，清站点数据会丢。
- 标注编号、回复芯片和提示层的 z-index 高于 Agent Teams 面板（110），面板打开时可能遮住面板顶部并吃掉点击。修正需要 `elementFromPoint` 做遮挡判定并在真浏览器里验证，暂缓。
- 当前会话 id 解析不到时，插件不动草稿，只在 Console 打一条 `[annotation]` 警告，这一次发送没有标注。
- `npm test` 需要 Node >= 22.22.2，这是 jsdom 30 声明的要求。`engines.node >= 20` 约束的是 DSH 宿主运行时，不是测试环境。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文（点击展开）</summary>

`client.js` 直接改、直接发，没有构建步骤，`npm run check` 只做语法解析。

上游发布新基座时按这个顺序走。

1. 用 `gh api repos/omdsh-dev/dsh-annotation/contents/client.js?ref=<commit>` 拉干净基座，或者给脚本传 `--fetch <commit>`。
2. 跑 `node scripts/apply-patches.mjs --fetch <commit> --out client.js --expect client.js`。
3. 工具报失配时，只改 `patches/manifest.json` 里对应 op 的 `find` 锚，语义不动，然后重跑。
4. 跑 `npm run check && npm test`，再在 DSH Web 里过一遍回车、Ctrl+Enter、斜杠技能和刷新后重发。

重放工具先做全局术语改名（批注改引用），再重放 81 条锚定 op，每条锚文本必须恰好命中一次。`client.js` 的 `exports.name`、包名和 `cordis.patch.yml` 里的条目 `name` 三处必须一致。

`test/client-load.test.mjs` 断言两份 README 的版本号和 op 条数与 `package.json`、`patches/manifest.json` 一致，改版本时一起更新。

`npm test` 需要 Node >= 22.22.2，这是 jsdom 30 的要求。`engines` 里的 Node 区间描述 DSH 宿主运行时。

</details>
