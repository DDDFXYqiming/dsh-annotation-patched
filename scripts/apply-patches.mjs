#!/usr/bin/env node
/**
 * apply-patches.mjs — dsh-annotation-patched 补丁重放工具
 *
 * 把 patches/manifest.json 里记录的 fork 改动（全局术语改名 + 包名 + 9 组功能补丁）
 * 重放到一份「干净上游 client.js」上，产出 fork 产物。
 *
 * 用法：
 *   node scripts/apply-patches.mjs --base <clean-client.js> --out <output.js> [--expect <known-good.js>] [--dry-run]
 *   node scripts/apply-patches.mjs --fetch <commit|ref> --out <output.js> [--expect ...]
 *                                    （--fetch 用 gh api 拉干净基座，需本机 gh 可用）
 *
 * 流程：读基座 → 术语改名（批注→引用）→ 逐条应用 ops（每条锚文本必须恰好命中 1 次，
 * 否则报错退出并列出失配项）→ 校验全部 PATCH( 标记在场 → 可选 --expect 字节比对 → 写出。
 *
 * 升级上游时的标准动作：
 *   1. gh api repos/omdsh-dev/dsh-annotation/contents/client.js?ref=<新commit> 拿干净基座
 *      （或直接 --fetch <commit>）
 *   2. node scripts/apply-patches.mjs --base clean.js --out client.js
 *   3. 失配的 op 逐条对照上游 diff 适配锚文本（只改 find 锚，语义不动），
 *      并在 patches/manifest.json 的 adaptedFor 字段记录
 *   4. npm run check && npm test，再进 DSH 实测
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base' || a === '--out' || a === '--expect' || a === '--fetch' || a === '--manifest') {
      args[a.slice(2)] = argv[++i]
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else {
      args._.push(a)
    }
  }
  return args
}

function fetchUpstreamClient(ref) {
  const out = execFileSync('gh', [
    'api', `repos/omdsh-dev/dsh-annotation/contents/client.js?ref=${ref}`, '--jq', '.content',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  return Buffer.from(out.replace(/\s+/g, ''), 'base64').toString('utf8')
}

const args = parseArgs(process.argv.slice(2))
const manifestPath = args.manifest
  ? resolve(args.manifest)
  : resolve(repoRoot, 'patches/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

let base
if (args.fetch) {
  console.log(`[fetch] omdsh-dev/dsh-annotation @ ${args.fetch}`)
  base = fetchUpstreamClient(args.fetch)
} else if (args.base) {
  base = readFileSync(resolve(args.base), 'utf8')
} else {
  console.error('需要 --base <file> 或 --fetch <ref>')
  process.exit(2)
}

let content = base
const failures = []

// ── step 1: 术语改名 ────────────────────────────────────────────────
for (const t of manifest.terminology ?? []) {
  const n = content.split(t.from).length - 1
  if (n === 0) failures.push(`[terminology] 「${t.from}」在基座中出现 0 次（上游可能已改名？请人工核对）`)
  else {
    content = content.split(t.from).join(t.to)
    console.log(`[terminology] 「${t.from}」→「${t.to}」× ${n}`)
  }
}

// ── step 2: 逐条 op ────────────────────────────────────────────────
let applied = 0
for (const op of manifest.ops) {
  const n = content.split(op.find).length - 1
  if (n !== 1) {
    failures.push(`[op ${op.id}] 锚文本命中 ${n} 次（要求恰好 1 次）— ${op.description}`)
    continue
  }
  content = content.replace(op.find, op.replace)
  applied++
}
console.log(`[ops] 应用 ${applied}/${manifest.ops.length}${failures.length ? `，失配 ${failures.length} 条` : ''}`)

// ── step 3: PATCH 标记在场校验 ─────────────────────────────────────
const markers = [...new Set([...content.matchAll(/PATCH\(([^)]+)\)/g)].map((m) => m[1]))]
console.log(`[markers] 产物内 PATCH 标记：${markers.join(', ') || '（无）'}`)

if (failures.length) {
  console.error('\n===== 失配清单 =====')
  for (const f of failures) console.error('  ' + f)
  console.error('\n升级动作：对照上游 diff 适配上述 op 的 find 锚文本（语义不动），更新 patches/manifest.json 后重跑。')
  process.exit(1)
}

// ── step 4: 可选字节比对 ───────────────────────────────────────────
if (args.expect) {
  const expect = readFileSync(resolve(args.expect), 'utf8')
  if (expect === content) console.log('[expect] 与已知良好产物字节级一致 ✓')
  else {
    console.error('[expect] 与已知良好产物不一致 ✗')
    process.exit(1)
  }
}

if (args.dryRun) {
  console.log('[dry-run] 不写出。')
} else if (args.out) {
  writeFileSync(resolve(args.out), content)
  console.log(`[out] 已写出 ${resolve(args.out)}（${Buffer.byteLength(content)} bytes）`)
} else {
  console.error('需要 --out <file>（或 --dry-run）')
  process.exit(2)
}
