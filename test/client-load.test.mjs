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

function makeCtx() {
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
            setDraft() {},
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

test('node half exports plugin identity', async () => {
  const mod = await import(pathToFileURL(resolve(root, 'index.mjs')).href)
  assert.equal(mod.default.name, pkg.name)
  assert.equal(typeof mod.default.apply, 'function')
})