[简体中文](README.md) | English

# dsh-annotation-patched

A locally enhanced fork of the DSH Web "select-and-quote" plugin, maintained at v0.3.7. The package carries the independent fork name `@dsh-external/dsh-annotation-patched` so its releases never collide with upstream ones.

The plugin does one concrete thing. You select text inside an assistant message in DSH Web, click "**引用**", optionally add a note (or leave it empty), and press Enter. The quote block is composed into your message and sent along with it. The model answers each quote by number, and the replies carry quote chips that expand on hover. Queue-jumping a message with Ctrl+Enter while a conversation is running carries the quotes just the same.

- Upstream lives at [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) (MIT; since upstream v1.4.11 the package name is `@changfenhuang/dsh-annotation`). This fork is based on v1.4.11-preview.1, upstream commit `ab594842` (2026-09-15, upstream note "adopted for DSH 0.1.6-alpha.1"; replay migrated 2026-09-17). Historical base is v1.4.1 plus issue#20, at `fd24ef92`
- This directory is upstream source plus local enhancements. Every change in `client.js` carries a `PATCH(YYYY-MM-DD)` marker, so `grep` finds them all
- To move to a new base, run `node scripts/apply-patches.mjs --fetch <upstream-commit> --out client.js` and every fork patch replays in one shot from the `patches/manifest.json` manifest

## Enhancements (local customizations, vs upstream v1.4.11-preview.1)

### 1. Empty quote = quote (single-button mode)

Select text in an assistant message and click "**引用**". The quote can be saved with nothing typed in it, which gives you a pure quote (it just marks the original text), matching Codex's Add to chat. The toolbar keeps a single "引用" button. Selection is explicit confirmation only. Copy actions and double-click word lookups never turn into a quote by themselves, and the "引用" button has to be clicked, so ghost quotes from stray selections cannot appear.

### 2. Ghost-quote fix (send-confirmed mode)

Upstream clears the pending-send quote set `quotes` only inside the `decorateAll` decorative-scan poll. That leaves a race window. When a bubble has not rendered yet, a label is missing, or messages go out in quick succession, `quotes` keeps residue around, and later messages you never selected get tagged with old quotes.

`PATCH(2026-08-14c)` made clearing listen to "send confirmed" only. `watchInputDraft` (the draft going from non-empty to empty marks a completed send) is the primary cleanup point, and `decorateAll` (a bubble appearing) stays as the fallback. A new `stripOldBlock()` regex-strips any residual old quote block from the draft before composing, so residue no longer attaches twice and no longer blocks new quote composition. The old guard (return when the draft contains the block) is removed, which closes the path where residue pollution made quotes stick forever.

### 3. Multi-line composer layout fix

The `引用 ×N` label lives in its own `position: fixed` layer and used to be positioned only when the quote count changed. Once the composer grew for multi-line input, the label stayed at its old coordinates and ended up inside the input box. Since `PATCH(2026-08-17)` the label position is kept in sync through `ResizeObserver`, input events, and composer-replace detection, so it sits above the input even on multi-line drafts.

### 4. Inline think-block stripping for legacy model services (v0.2.3)

Legacy model services without a separate reasoning channel write chain-of-thought straight into the text as think / thinking / thought tag blocks. Since `PATCH(2026-09-05)` these blocks are stripped from the assistant row's text nodes once streaming stops (a state machine carries over blocks split across nodes by the markdown renderer), and an `Annotation N:` mentioned inside the monologue no longer turns into a chip.

### 5. Slash skill calls carry quotes too (v0.3.4)

Save a quote from an assistant message, type `/human-writing fix it all`, press Enter and the quote block travels with that message. A skill's `/name` gesture takes free text, so the block is appended after the command. It neither breaks the command token prefix nor gets consumed as a host command argument, because the host (dsh-tool-skill) loads skills by scanning `/name` inside the whole user message on the server side. Built-in commands (`/goal`, `/model` and friends) keep upstream issue #20 behavior, sent as-is without the block, your quotes stay pending for the next message, and a toast says so. The decision reads the host's `remote.skills` catalog (per session, reused for 60 seconds, and when it is unavailable the conservative path above applies).

### 7. Queue-jumping messages carry quotes too (v0.3.6)

Press Ctrl+Enter to queue-jump a message while the conversation is running, and the quote block is composed into it just like any other send. Previously a queue-jumped message with typed text never got the block, so the model only saw your own words. The message is now handed back to the host's own queue-or-steer strategy, while a pure-quote empty draft is still sent directly by the plugin.

### 8. Queue-jumped bubbles heal their display (v0.3.7)

A queue-jumped message enters the message flow only after the current tool call finishes, and the host re-renders the message text once on entry, which brings the freshly hidden quote block back. Now the block is hidden again whenever it is still present in the bubble text, the `引用 ×N` label is added only when missing and never duplicated, and the bubble settles on user text plus the quote label.

### 9. Maintainability

- Every change carries a `PATCH(YYYY-MM-DD[group])` comment marker (from `2026-08-14` onwards; list them with `grep -o "PATCH([^)]*)" client.js | sort -u`), so upstream updates can be diffed and re-applied quickly
- The patch replay tool (since v0.2.0) is `scripts/apply-patches.mjs` plus `patches/manifest.json`. It takes a clean upstream artifact, applies the global term rename (批注→引用) and the package-name swap, then replays 81 anchored ops one by one (another 4 are retired because upstream v1.4.11 already covers them, recorded under `retired` in the manifest). Each anchor must hit exactly once, and a mismatch aborts with adaptation guidance
- Debug logs such as `[annotation] 引用块已拼入草稿…`, `[annotation] 斜杠技能 xxx 已随消息追加引用…` and compose logs (with send counts) show up in the DevTools console
- Running this repository's tests needs Node `>=22.22.2` (required by the jsdom 30 devDependency); `engines: >=20` in `package.json` only describes the DSH host runtime and does not mean the jsdom suite runs on Node 20
- The version and op counts stated in the README are checked against `package.json` / `patches/manifest.json` by a documentation-consistency assertion in `npm test`, so they cannot drift again

## Install

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# Or from a local dev checkout
dsh plugin --profile web add <repo dir>
```

## Known limits

- Only **assistant** messages can be selected (user-typed messages are ignored)
- Auto-quote fires on **Enter-to-send**, **Ctrl+Enter queue-jump**, and clicking the send button. Since v0.3.0 the button path is handled by upstream v1.4.11's `onSendPointerDown`/`onSendKeyboardClick` (the fork's own patch for it is retired), and all three paths compose the quote into the draft before submitting
- This is a browser-side plugin. Changes to `client.js` need a **Ctrl+F5 hard reload** (or a different browser) to take effect. `pnpm` updates overwrite the copy in `node_modules`, so relink from this directory to re-pin
- The plugin is tightly coupled to the DSH Web DOM structure (`[data-time-hover-root]`, `[class*="bubble"]`, `[data-composer-card]`, etc.). DSH UI upgrades may break it
- Carrying quotes on a slash skill call depends on the host's `remote.skills` service (the same source the official skill plugin uses; it is not injected, it is queried optionally with `ctx.get`). When that namespace is not mounted, the catalog has not arrived yet, or the call fails, that one message keeps upstream's conservative behavior (no block, quotes stay pending for the next message)
- Since v0.3.4 the package's loader entry id is `dsh-annotation-patched`, distinct from upstream's `dsh-annotation`, so installing both no longer produces a duplicate loader entry. If you wrote a profile-layer override against the old id, rename it together with this upgrade

## Upgrade log

- v0.3.0 moved the base from v1.4.1 (fd24ef92) to v1.4.11-preview.1 (ab594842) to adopt DSH 0.1.6's Lexical composer. 11 anchors adapted (package ids, attachAndSend, chip positioning, message-flow observer, Enter guard, dispose) and 4 retired (send-button compose and its dispose cleanup, focusComposer, session-switch pendingDeco clear), all already covered by upstream. Replay is 34/34 with no mismatch and byte-identical, and 7/7 tests pass
- v0.2.0 moved the base from v1.3.13 to v1.4.1 (plus issue#20) with 5 anchor adaptations. ① The toolbar text is i18n-aware now, it goes through `t()`, and the 可留空 hint moved into the zh/en dictionaries. ② `attachAndSend(e)` changed signature, the click path passes a synthetic event object. ③ `stripOldBlock` got bilingual sentinels, zh uses `提问：` and en uses `Ask:`. ④ The `updateChip` anchor follows `t(chip.count)`. ⑤ The export tail became a single-line anchor. Test assertions followed the inject and locale changes.

## License

MIT (upstream copyright preserved, see LICENSE)
