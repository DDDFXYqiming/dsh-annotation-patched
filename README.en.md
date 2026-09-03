[简体中文](README.md) | English

# dsh-annotation-patched

A locally enhanced fork of the DSH Web "select-and-quote" plugin, maintained at v0.2.1. The package carries the independent fork name `@dsh-external/dsh-annotation-patched` so its releases never collide with upstream ones.

The plugin does one concrete thing. You select text inside an assistant message in DSH Web, click "**引用**", optionally add a note (or leave it empty), and press Enter. The quote block is composed into your message and sent along with it. The model answers each quote by number, and the replies carry quote chips that expand on hover.

- Upstream lives at [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) (MIT). This fork is based on v1.4.1 plus the issue#20 fix, upstream commit fd24ef92 (upgrade replayed 2026-08-21)
- This directory is upstream source plus local enhancements. Every change in `client.js` carries a `PATCH(YYYY-MM-DD)` marker, so `grep` finds them all
- To move to a new base, run `node scripts/apply-patches.mjs --fetch <upstream-commit> --out client.js` and every fork patch replays in one shot from the `patches/manifest.json` manifest

## Enhancements (vs upstream v1.3.13)

### 1. Empty quote = quote (single-button mode)

Select text in an assistant message and click "**引用**". The quote can be saved with nothing typed in it, which gives you a pure quote (it just marks the original text), matching Codex's Add to chat. The toolbar keeps a single "引用" button. Selection is explicit confirmation only. Copy actions and double-click word lookups never turn into a quote by themselves, and the "引用" button has to be clicked, so ghost quotes from stray selections cannot appear.

### 2. Ghost-quote fix (send-confirmed mode)

Upstream clears the pending-send quote set `quotes` only inside the `decorateAll` decorative-scan poll. That leaves a race window. When a bubble has not rendered yet, a label is missing, or messages go out in quick succession, `quotes` keeps residue around, and later messages you never selected get tagged with old quotes.

`PATCH(2026-08-14c)` made clearing listen to "send confirmed" only. `watchInputDraft` (the draft going from non-empty to empty marks a completed send) is the primary cleanup point, and `decorateAll` (a bubble appearing) stays as the fallback. A new `stripOldBlock()` regex-strips any residual old quote block from the draft before composing, so residue no longer attaches twice and no longer blocks new quote composition. The old guard (return when the draft contains the block) is removed, which closes the path where residue pollution made quotes stick forever.

### 3. Multi-line composer layout fix

The `引用 ×N` label lives in its own `position: fixed` layer and used to be positioned only when the quote count changed. Once the composer grew for multi-line input, the label stayed at its old coordinates and ended up inside the input box. Since `PATCH(2026-08-17)` the label position is kept in sync through `ResizeObserver`, input events, and composer-replace detection, so it sits above the input even on multi-line drafts.

### 4. Inline think-block stripping for legacy model services (v0.2.3)

Legacy model services without a separate reasoning channel write chain-of-thought straight into the text as think / thinking / thought tag blocks. Since `PATCH(2026-09-05)` these blocks are stripped from the assistant row's text nodes once streaming stops (a state machine carries over blocks split across nodes by the markdown renderer), and an "Annotation N:" mentioned inside the monologue no longer turns into a chip.

### 5. Maintainability

- Every change carries a `PATCH(2026-08-14)` through `PATCH(2026-09-05)` comment marker, so upstream updates can be diffed and re-applied quickly
- The patch replay tool (since v0.2.0) is `scripts/apply-patches.mjs` plus `patches/manifest.json`. It takes a clean upstream artifact, applies the global term rename (批注→引用) and the package-name swap, then replays 38 anchored ops one by one. Each anchor must hit exactly once, and a mismatch aborts with adaptation guidance
- Debug logs such as `[annotation] 引用块已拼入草稿…` and compose logs (with send counts) show up in the DevTools console

## Install

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# Or from a local dev checkout
dsh plugin --profile web add <repo dir>
```

## Known limits

- Only **assistant** messages can be selected (user-typed messages are ignored)
- Auto-quote fires on both **Enter-to-send** and clicking the send button (since `PATCH(2026-08-14d)` the send button is intercepted at the capture stage so the quote is composed in first)
- This is a browser-side plugin. Changes to `client.js` need a **Ctrl+F5 hard reload** (or a different browser) to take effect. `pnpm` updates overwrite the copy in `node_modules`, so relink from this directory to re-pin
- The plugin is tightly coupled to the DSH Web DOM structure (`[data-time-hover-root]`, `[class*="bubble"]`, `[data-composer-card]`, etc.). DSH UI upgrades may break it

## Upgrade log

- v0.2.0 moved the base from v1.3.13 to v1.4.1 (plus issue#20) with 5 anchor adaptations. ① The toolbar text is i18n-aware now, it goes through `t()`, and the 可留空 hint moved into the zh/en dictionaries. ② `attachAndSend(e)` changed signature, the click path passes a synthetic event object. ③ `stripOldBlock` got bilingual sentinels, zh uses `提问：` and en uses `Ask:`. ④ The `updateChip` anchor follows `t(chip.count)`. ⑤ The export tail became a single-line anchor. Test assertions followed the inject and locale changes.

## License

MIT (upstream copyright preserved, see LICENSE)
