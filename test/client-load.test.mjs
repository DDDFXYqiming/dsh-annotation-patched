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

/** @param {string[]} [drafts] 收集 setDraft 写入的草稿，供断言 */
function makeCtx(drafts) {
  const sink = Array.isArray(drafts) ? drafts : []
  return {
    sessions: {
      list: {
        getSnapshot() { return { current: 'sess-test' } },
        subscribe() { return () => {} },
      },
      scope(id) { return { id } },
    },
    conversation: {
      input: {
        for() {
          return {
            state: {
              getSnapshot() { return { draft: '' } },
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
  assert.match(source, /ui\.quotes = \[\][\s\S]{0,240}pendingDeco = \[\]/)
  assert.doesNotMatch(source, /setInterval\(decorateAll/)
  assert.match(source, /decoDeadline = Date\.now\(\) \+ 5000/)
  assert.match(source, /rootObserver\.observe\(document\.body, \{ childList: true, subtree: true \}\)/)
  assert.doesNotMatch(source, /observer\.observe\(document\.body/)
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 走一遍真实交互链：选区 → 工具条「引用」→ 保存 → 在 composer 上按回车。
 * 返回 setDraft 收到的草稿列表（长度 1 = 引用块成功随消息拼稿）。
 * @param {Document} doc @param {any} window @param {string} composerHtml 输入面节点
 */
async function collectDraftsOnEnter(doc, window, composerHtml) {
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
  const cleanup = exported.apply(makeCtx(drafts))
  try {
    doc.dispatchEvent(new window.Event('selectionchange'))
    await wait(320)            // settle 定时器 250ms
    const quote = doc.querySelector('.dsh-ann-bar button')
    assert.ok(quote !== null, '选区工具条未出现')
    quote.click()              // 进入编辑
    await wait(0)
    doc.querySelector('.dsh-ann-action').click()   // 保存引用
    await wait(0)
    const editor = doc.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable="true"]')
    editor.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }))
    await wait(0)
    return drafts
  } finally {
    cleanup()
  }
}

test('Enter attaches the block on a Lexical contenteditable composer', async () => {
  const dom = createDom()
  try {
    const drafts = await collectDraftsOnEnter(
      dom.window.document, dom.window, '<div contenteditable="true" role="textbox"></div>')
    assert.equal(drafts.length, 1, '新 composer（contenteditable）回车必须拼入引用块')
    assert.match(drafts[0], /quoted passage/)
    assert.match(drafts[0], /提问：/)
  } finally {
    dom.window.close()
  }
})

test('Enter attaches the block on a legacy textarea composer (backward compat)', async () => {
  const dom = createDom()
  try {
    const drafts = await collectDraftsOnEnter(dom.window.document, dom.window, '<textarea></textarea>')
    assert.equal(drafts.length, 1, '老 composer（textarea）回车仍须拼入引用块')
    assert.match(drafts[0], /quoted passage/)
  } finally {
    dom.window.close()
  }
})

test('node half exports plugin identity', async () => {
  const mod = await import(pathToFileURL(resolve(root, 'index.mjs')).href)
  assert.equal(mod.default.name, pkg.name)
  assert.equal(typeof mod.default.apply, 'function')
})