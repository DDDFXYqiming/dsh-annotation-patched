import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function createDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
  })
  const { window } = dom

  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 0)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  }
  // jsdom 不实现 ResizeObserver：插件 updateChip 里的 observeChipComposer 会抛
  // TypeError（监听器异常被 jsdom 吞掉），chip 文案就永远停不住。补个空实现，
  // 让「引用保留」这类断言能真的读到 chip 内容。
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (typeof window.MutationObserver !== 'function') {
    window.MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    }
  }
  return dom
}

function loadClient(window) {
  let loadId = null
  let exported = null
  window.__ModuleLoader__ = {
    load(bundle) {
      loadId = bundle.id
      exported = bundle.factory((id) => {
        throw new Error('unexpected require in client bundle: ' + id)
      })
    },
  }

  const context = vm.createContext({
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    NodeFilter: window.NodeFilter,
    MutationObserver: window.MutationObserver,
    ResizeObserver: typeof window.ResizeObserver === 'function' ? window.ResizeObserver : undefined,
    requestAnimationFrame: typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : (id) => window.clearTimeout(id),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    URLSearchParams: window.URLSearchParams,
    // 技能清单请求要 AbortController；芯片装饰限流要 performance.now()（宿主环境两者都在）。
    AbortController: typeof window.AbortController === 'function' ? window.AbortController : undefined,
    performance: typeof window.performance !== 'undefined' ? window.performance : { now: () => Date.now() },
    localStorage: window.localStorage,
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Promise,
  })

  vm.runInContext(readFileSync(resolve(root, 'client.js'), 'utf8'), context, {
    filename: 'client.js',
  })
  return { loadId, exported }
}

/**
 * @param {string[]} [drafts] 收集 setDraft 写入的草稿，供断言
 * @param {object} [snapshot] 会话列表快照；缺省模拟老宿主（带 current）
 * @param {object} [workspace] uiWorkspace 服务（新宿主的视图层当前会话）
 * @param {string} [initialDraft] composer 里已有的草稿（模拟用户先打字再引用）
 * @param {object} [opts] {inputState} 覆盖 composer 输入机快照（phase/claim）；
 *                        {services} 额外可选服务（如 remote.skills 假服务）；
 *                        {locale} locale 服务快照
 */
function makeCtx(drafts, snapshot, workspace, initialDraft, opts) {
  const sink = Array.isArray(drafts) ? drafts : []
  const o = opts || {}
  return {
    get(name) {
      if (name === 'uiWorkspace') return workspace
      const extra = o.services || {}
      return Object.prototype.hasOwnProperty.call(extra, name) ? extra[name] : undefined
    },
    locale: {
      getSnapshot() { return o.locale ?? { active: 'zh' } },
      subscribe() { return () => {} },
    },
    sessions: {
      list: {
        getSnapshot() { return snapshot ?? { current: 'sess-test' } },
        subscribe() { return () => {} },
      },
      scope(id) { return { id } },
    },
    conversation: {
      input: {
        for() {
          return {
            state: {
              getSnapshot() { return { draft: initialDraft ?? '', ...(o.inputState || {}) } },
              subscribe() { return () => {} },
            },
            setDraft(text) { sink.push(text) },
          }
        },
      },
    },
  }
}

test('client bundle registers ModuleLoader id and exports', () => {
  const dom = createDom()
  try {
    const { loadId, exported } = loadClient(dom.window)
    assert.equal(loadId, pkg.name)
    assert.equal(exported.name, pkg.name)
    // 上游 v1.4.0 起注入 locale 服务（zh/en 双语 UI）
    assert.equal(exported.inject.length, 3)
    assert.equal(exported.inject[0], 'sessions')
    assert.equal(exported.inject[1], 'conversation')
    assert.equal(exported.inject[2], 'locale')
    // remote.skills（技能清单）刻意不写进 inject：该服务由宿主按命名空间动态挂载，
    // 硬注入会让整个插件在清单缺席时不加载；插件内改用 ctx.get 可选查询。
    assert.equal(exported.inject.indexOf('remote.skills'), -1)
    assert.equal(typeof exported.apply, 'function')
  } finally {
    dom.window.close()
  }
})

test('apply returns a disposable cleanup without throwing', () => {
  const dom = createDom()
  try {
    const { exported } = loadClient(dom.window)
    let cleanup
    assert.doesNotThrow(() => {
      cleanup = exported.apply(makeCtx())
    })
    assert.equal(typeof cleanup, 'function')
    assert.doesNotThrow(() => cleanup())
  } finally {
    dom.window.close()
  }
})

test('session changes clear pending decoration and polling is bounded', () => {
  const source = readFileSync(resolve(root, 'client.js'), 'utf8')
  // 上游 v1.4.11 起：会话切换按会话恢复 pendingQuotes，并用 pendingDeco.length = 0
  // 作废发送暂存（fork 的 pendingDeco = [] 已被上游覆盖，见 manifest.retired）
  assert.match(source, /ui\.quotes = readPendingQuotes\(cur\)[\s\S]{0,400}pendingDeco\.length = 0/)
  assert.doesNotMatch(source, /setInterval\(decorateAll/)
  assert.match(source, /decoDeadline = Date\.now\(\) \+ 5000/)
  assert.match(source, /rootObserver\.observe\(document\.body, \{ childList: true, subtree: true \}\)/)
  assert.doesNotMatch(source, /observer\.observe\(document\.body/)
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const J4 = (parts) => parts.join('\n')

/**
 * 走一遍真实交互链：选区 → 工具条「引用」→ 保存 → 在 composer 上按回车。
 * 返回 setDraft 收到的草稿列表（长度 1 = 引用块成功随消息拼稿）。
 * @param {Document} doc @param {any} window @param {string} composerHtml 输入面节点
 */
async function collectDraftsOnEnter(doc, window, composerHtml, snapshot, workspace, initialDraft, opts) {
  doc.body.innerHTML = [
    '<div data-chat-flow>',
    '  <div data-chat-flow-kind="assistant-step" data-chat-anchor-key="a1">',
    '    <span id="src">quoted passage</span>',
    '  </div>',
    '</div>',
    '<div data-composer-card><div data-input-scroll>' + composerHtml + '</div></div>',
  ].join('')
  // jsdom 无布局引擎：rect 全 0 会被「选区不可见」判定挡掉工具条
  const rect = () => ({
    x: 10, y: 10, top: 10, left: 10, bottom: 30, right: 120, width: 110, height: 20,
  })
  window.Element.prototype.getBoundingClientRect = rect
  window.Range.prototype.getBoundingClientRect = rect
  const rects = () => {
    const list = [rect()]
    list.item = (i) => list[i]
    return list
  }
  window.Range.prototype.getClientRects = rects
  const range = doc.createRange()
  range.selectNodeContents(doc.getElementById('src'))
  const sel = {
    isCollapsed: false, rangeCount: 1,
    getRangeAt: () => range,
    toString: () => 'quoted passage',
    removeAllRanges() {}, addRange() {},
  }
  window.getSelection = () => sel

  const drafts = []
  const { exported } = loadClient(window)
  const cleanup = exported.apply(makeCtx(drafts, snapshot, workspace, initialDraft, opts))
  try {
    doc.dispatchEvent(new window.Event('selectionchange'))
    await wait(320)            // settle 定时器 250ms
    const quote = doc.querySelector('.dsh-ann-bar button')
    assert.ok(quote !== null, '选区工具条未出现')
    quote.click()              // 进入编辑
    await wait(0)
    doc.querySelector('.dsh-ann-action').click()   // 保存引用
    // 技能清单是在保存引用时异步预热的（回车判定同步读缓存），给它一拍。
    await wait(20)
    const editor = doc.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable="true"]')
    editor.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }))
    await wait(0)
    // chip / toast 都挂在插件自有层上，cleanup 会摘掉，必须在 try 内读。
    const toastEl = doc.querySelector('[data-annotation-toast]')
    return {
      drafts,
      toast: toastEl !== null ? toastEl.textContent : '',
      chip: doc.querySelector('[data-annotation-chip]').textContent,
    }
  } finally {
    cleanup()
  }
}

test('Enter attaches the block on a Lexical contenteditable composer', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, '<div contenteditable="true" role="textbox"></div>')
    assert.equal(drafts.length, 1, '新 composer（contenteditable）回车必须拼入引用块')
    assert.match(drafts[0], /quoted passage/)
    // 上游 v1.4.11 纯引用块走 block.headOnly/formatOnly（无「提问：」分隔标记）
    assert.match(drafts[0], /我引用了以下/)
  } finally {
    dom.window.close()
  }
})

test('Enter attaches the block on a legacy textarea composer (backward compat)', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(dom.window.document, dom.window, '<textarea></textarea>')
    assert.equal(drafts.length, 1, '老 composer（textarea）回车仍须拼入引用块')
    assert.match(drafts[0], /quoted passage/)
  } finally {
    dom.window.close()
  }
})

// 回归：DSH 0.1.6 起 sessions.list 快照不再带 current（ClientSessions 把视图选择移出
// Controller），插件必须回退到宿主自己持久化的会话选择，否则回车拼稿整条链路静默失效。
test('0.1.6：快照无 current 时回退 localStorage[dsh.sessions.current]', async () => {
  const dom = createDom()
  try {
    dom.window.localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'sess-ls' }))
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, '<div contenteditable="true" role="textbox"></div>',
      { ids: ['sess-ls'], byId: {}, phase: 'ready' })
    assert.equal(drafts.length, 1, '快照无 current 时仍须把引用块拼进草稿')
    assert.match(drafts[0], /quoted passage/)
  } finally {
    dom.window.close()
  }
})

test('0.1.6：快照无 current 时回退 uiWorkspace 视图层当前会话', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, '<div contenteditable="true" role="textbox"></div>',
      { ids: ['sess-ui'], byId: {}, phase: 'ready' },
      { mainReference: { sessionId: 'sess-ui' }, selection: { getSnapshot: () => ({ sessionId: 'sess-ui' }) } })
    assert.equal(drafts.length, 1, 'uiWorkspace 回退路径也须拼稿')
    assert.match(drafts[0], /quoted passage/)
  } finally {
    dom.window.close()
  }
})

// 回归：用户先打字、再收集引用、然后回车——引用块要拼进去，但**用户自己的文字不能被吞**。
// 0.3.1 起纯引用块补剥的 else 分支会把没有残留块的草稿整块置空，实测表现为前端气泡里
// 只剩「引用 ×1」，用户输入消失。
test('回车拼稿不得吞掉用户已输入的文字', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, '<div contenteditable="true" role="textbox"></div>',
      undefined, undefined, '帮我把这段代码改成 TypeScript')
    assert.equal(drafts.length, 1, '回车必须拼稿')
    assert.match(drafts[0], /quoted passage/, '引用块要在')
    assert.match(drafts[0], /帮我把这段代码改成 TypeScript/, '用户自己输入的文字必须保留')
    assert.match(drafts[0], /提问：/, '带正文时必须有「提问：」分隔标记')
  } finally {
    dom.window.close()
  }
})

// ---------- 斜杠技能调用携带引用（2026-09-18 实盘 bug 回归） ----------
// 旧守卫把任何以 / 开头的草稿一律当宿主命令跳过拼稿，表现为「选中引用 +
// /human-writing 全部修复」回车后引用永远发不出去、chip 常驻「1 条引用」。
// 技能手势的参数是自由文本，引用块后置追加既不破坏 token 前缀（宿主服务端
// invokedSkillNames 全文扫描 SKILL_GESTURE 识别手势），也不会被并入宿主命令参数。
const skillRemote = (names) => ({
  list: async () => ({ ok: true, value: { skills: names.map((n) => ({ name: n })) } }),
})
const SKILL_SERVICES = () => ({ 'remote.skills': skillRemote(['human-writing', 'ppt-master']) })
const EDITOR = '<div contenteditable="true" role="textbox"></div>'

test('斜杠技能调用随消息携带引用块（引用后置，token 前缀保留）', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, EDITOR,
      undefined, undefined, '/human-writing 全部修复', { services: SKILL_SERVICES() })
    assert.equal(drafts.length, 1, '技能手势必须拼稿')
    const d = drafts[0]
    assert.ok(d.startsWith('/human-writing 全部修复'), '命令 token 前缀必须原样保留：' + JSON.stringify(d.slice(0, 40)))
    assert.ok(d.indexOf('我引用了以下') > d.indexOf('/human-writing'), '引用块必须追加在命令之后')
    assert.match(d, /quoted passage/, '引用原文要随消息发出')
    assert.doesNotMatch(d, /提问：/, '技能参数区不带「提问：」标记（headOnly 纯引用块）')
    assert.match(d, /请按「Annotation N：…」的格式，逐条回应以上引用。/, '块尾格式指令要在')
  } finally {
    dom.window.close()
  }
})

test('非技能的斜杠命令仍跳过拼稿（toast + 引用保留待下一条）', async () => {
  const dom = createDom()
  try {
    const { drafts, toast, chip } = await collectDraftsOnEnter(
      dom.window.document, dom.window, EDITOR,
      undefined, undefined, '/goal 把引用里的段落讲清楚', { services: SKILL_SERVICES() })
    assert.equal(drafts.length, 0, '清单里没有的 token 不得拼稿（issue #20 行为保持）')
    assert.match(toast, /未拼入引用/, '要给出跳过提示')
    assert.equal(chip, '1条引用', '引用必须保留，不被静默丢弃')
  } finally {
    dom.window.close()
  }
})

test('技能草稿尾部残留旧引用块时重发只拼一块', async () => {
  const dom = createDom()
  try {
    const residual = J4([
      '/human-writing 全部修复',
      '',
      '我引用了以下内容，请逐条回应：',
      '',
      '1. 过期的旧内容',
      '',
      '请按「Annotation N：…」的格式，逐条回应以上引用。',
    ])
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, EDITOR,
      undefined, undefined, residual, { services: SKILL_SERVICES() })
    assert.equal(drafts.length, 1, '残留块不得阻塞拼稿')
    const d = drafts[0]
    assert.equal((d.match(/我引用了以下/g) || []).length, 1, '不得双拼引用块：' + JSON.stringify(d))
    assert.doesNotMatch(d, /过期的旧内容/, '过期残留块必须剥掉')
    assert.match(d, /quoted passage/, '新引用块要在')
    assert.ok(d.startsWith('/human-writing 全部修复'), '命令前缀保留')
  } finally {
    dom.window.close()
  }
})

test('宿主已认领命令（claim / phase 忙）时不抢拼稿', async () => {
  const dom = createDom()
  try {
    const { drafts } = await collectDraftsOnEnter(
      dom.window.document, dom.window, EDITOR,
      undefined, undefined, '/human-writing 全部修复', {
        services: SKILL_SERVICES(),
        inputState: { phase: 'claimed', claim: { name: 'human-writing', token: '/human-writing ' } },
      })
    assert.equal(drafts.length, 0, 'claim 在手时草稿归宿主输入机')
  } finally {
    dom.window.close()
  }
})

test('技能清单未就绪或拉取失败时保守跳过（不回归 issue #20）', async () => {
  for (const services of [
    {},                                                       // 服务未挂载（remote.skills 不存在）
    { 'remote.skills': { list: async () => { throw new Error('offline') } } },  // 拉取失败
  ]) {
    const dom = createDom()
    try {
      const { drafts, chip } = await collectDraftsOnEnter(
        dom.window.document, dom.window, EDITOR,
        undefined, undefined, '/human-writing 全部修复', { services })
      assert.equal(drafts.length, 0, '拿不到清单时保持上游行为')
      assert.equal(chip, '1条引用', '引用保留待下一条')
    } finally {
      dom.window.close()
    }
  }
})

// 回归（0.3.3 审查 MINOR-2）：assistantDecorateTimer 是 ≤500ms 的拖尾限流，
// dispose 不摘它，卸载后仍会把芯片插进宿主助手行——tipLayer 已 remove 成死芯片，
// 且 data-annotation-reply-chip 标记会让重载后的新 fiber 跳过该行（热重载芯片失效）。
test('dispose 后拖尾装饰定时器不再改动宿主 DOM', async () => {
  const dom = createDom()
  const { window } = dom
  const doc = window.document
  doc.body.innerHTML = [
    '<div data-chat-flow>',
    '  <div data-time-hover-root><p id="r1">idle</p></div>',
    '  <div data-time-hover-root><p id="r2">idle</p></div>',
    '</div>',
  ].join('')
  const { exported } = loadClient(window)
  const cleanup = exported.apply(makeCtx())
  // 先让限流窗口过期（lastAssistantDecorate 初值 0），下一次变更才走立即分支。
  await wait(600)
  doc.getElementById('r1').firstChild.nodeValue = 'Annotation 1: one'
  await wait(50)
  assert.equal(
    doc.getElementById('r1').querySelectorAll('[data-annotation-reply-chip]').length,
    1, '前置条件：装饰本身工作正常')
  // 紧接着 500ms 窗口内的第二次变更只会落到拖尾定时器（≤500ms 后触发）→ 立刻卸载。
  doc.getElementById('r2').firstChild.nodeValue = 'Annotation 2: two'
  await wait(30)
  cleanup()
  await wait(800)
  assert.equal(
    doc.getElementById('r2').querySelectorAll('[data-annotation-reply-chip]').length,
    0, '卸载后不得再往宿主行插芯片')
  // 卸载后 toast 节点也必须消失（定时器摘掉时顺手删节点）。
  assert.equal(doc.querySelector('[data-annotation-toast]'), null)
  window.close()
})

// 0.3.3 审查 MINOR-3：tipLayer 是 fiber 级单例，每枚芯片/每个气泡标签再挂一对
// mouseenter/mouseleave 会随数量无界累积；现在悬停宽限统一由单例控制器持有。
test('tipLayer 监听器只注册一对（不随芯片与标签累积）', () => {
  const source = readFileSync(resolve(root, 'client.js'), 'utf8')
  const n = (source.match(/tipLayer\.addEventListener/g) || []).length
  assert.equal(n, 2, 'tipLayer 上只允许 showChipTip 处那对 keep/hide 监听器')
  assert.doesNotMatch(source, /var bubbleGrace = null/)
  assert.doesNotMatch(source, /chip\.addEventListener\('mouseleave', hide\)/)
})

// 0.3.3 审查 MINOR-1：编辑态删除按钮曾硬编码中文，en 界面下显示中文。
test('编辑卡删除按钮文案走 t() 双语字典', () => {
  const source = readFileSync(resolve(root, 'client.js'), 'utf8')
  assert.doesNotMatch(source, /del\.textContent = '删除引用'/)
  assert.match(source, /del\.textContent = t\('edit\.delete'\)/)
  assert.match(source, /delete: '删除引用',/)
  assert.match(source, /delete: 'Delete annotation',/)
})

// 09-02 与 09-18 两轮审查都抓到「README 自述数字陈旧」，这里把它变成断言：
// README（中英）里的版本号必须等于 package.json，op 条数必须等于 manifest.opsCount。
test('README 自述的版本与 op 条数不漂移', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'patches', 'manifest.json'), 'utf8'))
  assert.equal(manifest.ops.length, manifest.opsCount, 'manifest.opsCount 要与 ops 数组一致')
  for (const name of ['README.md', 'README.en.md']) {
    const doc = readFileSync(resolve(root, name), 'utf8')
    assert.ok(doc.includes('v' + pkg.version), name + ' 的版本号应与 package.json 一致（v' + pkg.version + '）')
    assert.ok(doc.includes(String(manifest.opsCount) + ' 条') || doc.includes('replays ' + manifest.opsCount + ' anchored ops'),
      name + ' 的 op 条数应与 manifest.opsCount 一致（' + manifest.opsCount + '）')
  }
})
// 配套回归：技能手势发出的那条消息，气泡里只该留下命令文本，
// 尾部协议块要被判图手术切掉并贴上「引用 ×N」标签（op63）。
test('技能手势消息的气泡只留命令文本，尾部引用块被隐藏并贴标签', () => {
  const dom = createDom()
  const doc = dom.window.document
  const row = doc.createElement('div')
  row.setAttribute('data-time-hover-root', '')
  const bubble = doc.createElement('div')
  bubble.className = 'user-bubble'
  bubble.textContent = [
    '/human-writing 全部修复',
    '',
    '我引用了以下内容，请逐条回应：',
    '',
    '1. quoted passage',
    '',
    '请按「Annotation N：…」的格式，逐条回应以上引用。',
  ].join('\n')
  row.appendChild(bubble)
  doc.body.appendChild(row)
  const { exported } = loadClient(dom.window)
  const cleanup = exported.apply(makeCtx())  // kickDecorate → decorateAll 同步执行
  try {
    // 标签就 append 在气泡内部，所以只断言「命令在开头 + 协议文本不见」。
    assert.ok(bubble.textContent.startsWith('/human-writing 全部修复'), '命令文本要保留：' + bubble.textContent)
    assert.doesNotMatch(bubble.textContent, /我引用了以下|Annotation N/, '尾部协议块要被判图手术切掉')
    const tag = row.querySelector('[data-annotation-bubble-tag]')
    assert.ok(tag !== null, '应贴上引用标签')
    assert.equal(tag.textContent, '引用 ×1')
  } finally {
    cleanup()
    dom.window.close()
  }
})
test('node half exports plugin identity', async () => {
  const mod = await import(pathToFileURL(resolve(root, 'index.mjs')).href)
  assert.equal(mod.default.name, pkg.name)
  assert.equal(typeof mod.default.apply, 'function')
})

// 旧模型服务把思考过程内联进正文（标签用 charCode 拼：agent 工具链会吞标签字面量）。
test('inline think blocks are stripped from assistant rows before chip decoration', () => {
  const dom = createDom()
  try {
    const { exported } = loadClient(dom.window)
    const doc = dom.window.document
    const T = String.fromCharCode(60) + 'think' + String.fromCharCode(62)
    const TE = String.fromCharCode(60) + '/think' + String.fromCharCode(62)
    const row = doc.createElement('div')
    row.setAttribute('data-time-hover-root', '')
    const p = doc.createElement('p')
    // 块跨两个文本节点：状态机必须续接；think 独白里的「Annotation 1:」不得变芯片
    const a = doc.createTextNode(T + 'The user wants a recap. Annotation 1: poisoned inside ')
    const b = doc.createTextNode('think.' + TE + 'Annotation 1: real answer.')
    p.appendChild(a)
    p.appendChild(b)
    row.appendChild(p)
    doc.body.appendChild(row)
    exported.apply(makeCtx()) // kickDecorate → decorateAll 同步执行
    assert.ok(!row.textContent.includes('poisoned inside'), 'think content removed')
    assert.ok(!row.textContent.includes(T) && !row.textContent.includes(TE), 'think tags removed')
    assert.ok(row.textContent.includes('real answer'), 'answer kept')
    const chips = row.querySelectorAll('[data-annotation-reply-chip]')
    assert.equal(chips.length, 1, 'only the real Annotation 1 becomes a chip')
  } finally {
    dom.window.close()
  }
})
