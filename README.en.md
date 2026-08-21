[简体中文](README.md) | English

# dsh-annotation-patched

A locally enhanced (fork-maintained) version of the DSH Web "select to quote" plugin.

## Origin

- Upstream project: [omdsh-dev/dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) (MIT License, v1.3.13)
- Upstream capability: select text in an assistant reply → quote (may be left empty) → pressing Enter sends it along with the message; the model cross-references each item via `Annotation N:` (rendered as hoverable chips in the reply); the quote block does not appear in your own bubble (zero-flicker hiding)
- This directory contains the upstream code plus local enhancements (every change in client.js is marked with a dated `PATCH(...)` tag and can be located with `grep`)

## Enhancements (relative to upstream v1.3.13)

### 1. Empty quote = quote (single-button design)

Select text in an assistant message → click "**Quote**" → the quote may be left empty and saved directly = a pure quote (marks the original text only), consistent with Codex's "Add to chat".

- The toolbar keeps only the "Quote" button (as of v2026-08-14c, the temporarily added "Empty quote" button was removed — empty quotes are handled by the Quote button's `note=''` path, which is functionally equivalent)
- **Explicit confirmation only**: no selection action (copying, double-clicking to read a word) automatically becomes a quote — the "Quote" button must be clicked (eliminates ghost quotes)
- Deduplication of identical text follows the upstream rule (the button is disabled for text already in the list)
- An earlier "select to auto-quote" approach (snapshot on selection, auto-consumed on Enter) was tried, but real-world testing showed severe false triggers (copying or reading a selection would trigger a quote); it was abandoned and reverted to the button design (v2026-08-14b)

### 2. Ghost quote fix (clear-on-compose → send-confirmation based)

In upstream, the only cleanup path for `quotes` (the pending quote set) is the `decorateAll` decoration-scan polling (clears only after bubbles render → quote blocks switch in → labels are all attached successfully), which leaves a race window: if bubbles have not rendered, markers are missing, or messages are sent in rapid succession, `quotes` can linger, causing later messages to carry stale quotes even without any selection.

v2026-08-14 switched to "clear on compose" (clearing immediately after setDraft in `attachAndSend`), but that introduced a new race: **the clear happened before send confirmation** —

- Symptom A (lost quotes): quotes were already cleared after composing, but the composer submitted the old draft (IME composition, focus shift, unflushed React state, etc.) → the message went out without quotes, and the quotes were lost too
- Symptom B (duplicate attachment): composing succeeded but submission failed → the draft kept the "I quote the following…" block while quotes was already empty → the next ordinary message went out carrying the leftover block; worse, the old guard `draft.indexOf('我引用了以下') !== -1` prevented any new quote from ever being composed into the draft

**v2026-08-14c final approach**:

- `attachAndSend` no longer clears on compose — **quotes cleanup only recognizes "send confirmation"**: `watchInputDraft` (draft going from non-empty to empty = send completed) is the primary cleanup point, with `decorateAll` (bubble appears) as a fallback
- Added `stripOldBlock()`: before composing, a regex (`/\n*我引用了以下[\s\S]*?\n\n提问：(?:\n+)?/g`) strips any leftover old quote block from the draft, then the new block is appended — leftovers no longer cause duplicate attachments nor block new quotes from being composed
- Removed the old guard (return if the draft contains the block), eliminating the "leftover pollution → quotes permanently stuck" path

### 3. Multi-line input box layout fix

- The `引用 ×N` label is a separate `position: fixed` layer that was previously positioned only when the quote count changed; once the input box auto-grew, the label stayed at its old coordinates and sank into the input box.
- Since `PATCH(2026-08-17)`, label position is continuously synced via `ResizeObserver`, input events, and composer replacement detection, so it stays above the input box even with multi-line input.

### 4. Maintainability

- All changes carry `PATCH(2026-08-14)` ~ `PATCH(2026-08-17)` comment markers, so diffs can be quickly located and re-applied when upstream updates
- Debug logs `[annotation] 引用块已拼入草稿…` / compose logs include the number of items sent (visible in the DevTools Console)

## Installation

Install from GitHub (recommended):

```bash
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
# For local development you can also use the repository directory directly
dsh plugin --profile web add <本目录>
```

## Known Limitations

- Only selections in **assistant messages** are supported (messages sent by the user are not handled)
- Auto-quoting triggers on both **Enter to send** and **clicking the send button** (since PATCH(2026-08-14d): the send button is intercepted at the capture phase to compose first)
- Browser-side plugin: after changing `client.js`, a **hard refresh with Ctrl+F5** (or switching browsers) is required for changes to take effect; **pnpm updates overwrite** the copy in node_modules, so re-link with this directory as the source
- Strongly coupled to the DSH Web DOM structure (`[data-time-hover-root]`, `[class*="bubble"]`, `[data-composer-card]`, etc.); DSH UI upgrades may break it

## Maintenance Markers

- All changes in this fork carry `PATCH(2026-08-14)` ~ `PATCH(2026-08-14e)` comment markers (grep `PATCH(2026-08-14` to locate them all), so diffs can be quickly re-applied when upstream updates
- The package name has been changed to the independent fork package `@dsh-external/dsh-annotation-patched` (v0.1.0), avoiding publish conflicts with upstream `@omdsh-dev/dsh-annotation`

## License

MIT (the upstream copyright notice is retained; see LICENSE)
