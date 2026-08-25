[简体中文](README.md) | English

# dsh-annotation-patched

Local enhancement fork of the DSH Web "select-and-quote" plugin. Renamed to the independent fork package `@dsh-external/dsh-annotation-patched` (v0.2.0) to avoid conflicts with upstream releases.

- **Upstream**: [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) (MIT, base v1.4.1 + issue#20 fix, commit fd24ef92, upgrade replay 2026-08-21)
- **This directory** = upstream source + local enhancements (every change in `client.js` is tagged with a `PATCH(YYYY-MM-DD)` marker, findable via `grep`)
- **Upgrade path**: `node scripts/apply-patches.mjs --fetch <upstream-commit> --out client.js` re-plays every fork patch in one shot (manifest in `patches/manifest.json`)

## Enhancements (vs upstream v1.3.13)

### 1. Empty quote = quote (single-button mode)

Select assistant text → click "**引用**" → the quote can be left empty and saved as a pure quote (just marks the original text), matching Codex's Add to chat. The toolbar keeps only the "引用" button. **Explicit confirmation**: any selection action (copy, double-click a word to read) never auto-becomes a quote — you must click "引用", eliminating ghost quotes.

### 2. Ghost-quote fix (send-confirmed mode)

Upstream `quotes` (pending-send quote set) is cleared only inside the `decorateAll` decorative-scan poll, which has a race window: if a bubble doesn't render, a label is missing, or rapid sends happen, `quotes` residue stays around and later non-selected messages get tagged with old quotes.

`PATCH(2026-08-14c)` final solution: quote clearing only happens on "send confirmed" — `watchInputDraft` (draft goes from non-empty to empty = send completed) is the primary cleanup, `decorateAll` (bubble appears) is the fallback. New `stripOldBlock()`: before composing, strip any residual old quote block from the draft via regex — residue no longer causes double-attachment and no longer blocks new quote composition. Removed the old guard (return if draft contains the block) to eliminate the "residue → quotes permanently stuck" path.

### 3. Multi-line composer layout fix

The `引用 ×N` label lives in an independent `position: fixed` layer that was previously positioned only on quote-count changes. When the composer auto-grew for multi-line input, the label would stay at the old coordinates and embed inside the input. Since `PATCH(2026-08-17)`, label position is kept in sync via `ResizeObserver`, input events, and composer-replace detection — the label always sits above the input even when multi-line.

### 4. Maintainability

- All changes carry `PATCH(2026-08-14)` ~ `PATCH(2026-08-17)` comment markers; upstream updates can be diffed and re-applied
- **Patch replay tool (since v0.2.0)**: `scripts/apply-patches.mjs` + `patches/manifest.json` — clean upstream artifact → global term rename (批注→引用) → package-name swap → 21 anchored ops replayed one by one (each anchor must hit exactly once; mismatch aborts with adaptation guidance)
- Debug logs `[annotation] 引用块已拼入草稿…` / compose logs include send counts (visible in DevTools console)

## Install

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# Or from a local dev checkout
dsh plugin --profile web add <repo dir>
```

## Known limits

- Only supports selecting **assistant** messages (user-typed messages are ignored)
- Auto-quote triggers on both **Enter-to-send** and **clicking the send button** (since `PATCH(2026-08-14d)`: send button is intercepted at the capture stage to pre-pend the quote)
- Browser-side plugin: changes to `client.js` require a **Ctrl+F5 hard reload** (or switch browser) to take effect; `pnpm` updates overwrite the copy in `node_modules` — relink from this directory to re-pin
- Tightly coupled to DSH Web DOM structure (`[data-time-hover-root]`, `[class*="bubble"]`, `[data-composer-card]`, etc.); DSH UI upgrades may break it

## Upgrade log

- v0.2.0: base v1.3.13 → v1.4.1 (+ issue#20); 5 anchor adaptations — ① toolbar i18n'd (text goes through `t()`, "可留空" hint added to zh/en dicts) ② `attachAndSend(e)` signature (click path passes synthetic event object) ③ `stripOldBlock` upgraded to bilingual sentinels (zh `提问：` / en `Ask:`) ④ `updateChip` anchor updated for `t(chip.count)` ⑤ single-line export-tail anchor; test assertions followed the inject + locale change

## License

MIT (upstream copyright preserved, see LICENSE)
