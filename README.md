---
description: "Send a selection from an assistant reply as a numbered annotation and read a numbered answer to each one."
kind: "package-bundle"
---

# @dsh-external/dsh-annotation-patched

English | [中文](README.zh.md)

## Summary

`dsh-annotation-patched` v0.3.7 adds selection annotation to the DSH Web client. Select text in an assistant reply, write an optional note, and press Enter to send the annotation block with your message. The model answers each annotation by number, and every numbered answer becomes a hoverable chip that shows the quoted passage. Pending annotations are stored per session, so they survive a page reload until you send or delete them.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How the plugin works](#how-the-plugin-works)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="installation"></a>
## Installation

Install the package into the web profile from GitHub:

```bash
dsh plugin --profile web add github:DDDFXYqiming/dsh-annotation-patched
```

To install from a local checkout, clone the repository, install its development dependencies, and add the directory:

```bash
git clone https://github.com/DDDFXYqiming/dsh-annotation-patched.git
cd dsh-annotation-patched
npm install
dsh plugin --profile web add .
```

The profile applies bundle changes at startup. Restart DSH after adding the package, then hard reload the Web page with Ctrl+F5 so the browser fetches the current client bundle.

The package targets the Web client. Its Node entry registers the plugin identity with an empty `apply`, and the browser half loads through the client module table.

-----

<a id="usage"></a>
## Usage

1. Select text in an assistant reply. A small floating toolbar appears next to the selection with a single **Annotate** button (引用 in the Chinese UI).
2. Click the button. Write a note, or leave it empty to quote the passage without a note, then save.
3. The quoted text gets a numbered highlight, and a badge above the composer shows `Annotations ×N`. Hover the badge to review the list, click a number to edit its note, and delete entries from the editor.
4. Send with Enter, the send button, or Ctrl+Enter while the conversation is running. The plugin prepends the annotation block to your message before the host submits it.
5. The model is asked to answer `Annotation 1` through `Annotation N`. When the reply finishes streaming, each label becomes a hoverable chip that shows the quoted passage and your note.
6. A slash skill such as `/human-writing fix this` keeps the annotations. The plugin appends the annotation block after the command, and the host still loads the skill from the message. Built-in slash commands such as `/goal` and `/model` send without annotations; a toast says the annotations stay pending for the next message.

Pending annotations are stored per session in the browser and restored after a reload. Sending clears them, and deleting an entry in the badge editor removes it from the pending list.

-----

<a id="configuration"></a>
## Configuration

The plugin reads its settings from the host and the profile entry.

- Display language follows the DSH locale service. Both `zh` and `en` are available, and the plugin falls back to `zh` when the locale service is absent. The annotation block uses the same language as the UI.
- Pending annotations live in browser `localStorage` under `dsh.annotation.pending.v1.<sessionId>`.
- To disable the plugin, remove the package from the profile, or disable its loader entry id `dsh-annotation-patched` in the profile patch layer.

-----

<a id="how-the-plugin-works"></a>
## How the plugin works

<details>
<summary>Implementation details (click to expand)</summary>

`index.mjs` is the Node half. It exports the package name and an empty `apply`; the real work happens in the browser.

`client.js` is a hand written CommonJS bundle wrapped in `window.__ModuleLoader__.load`. The registration id must equal the package name. The bundle renders its own DOM and imports no `@deepseek-ai` values. It receives `sessions`, `conversation`, and `locale` as cordis services.

`cordis.patch.yml` inserts the loader entry `dsh-annotation-patched` with `name` set to the package name. The id differs from the upstream `dsh-annotation` id so both packages can be installed at once. Later profile patches can override or disable the entry by id.

Selection capture: `selectionchange` opens the toolbar. Saving a quote records the message anchor key, the text offset, the surrounding context, the quoted text, and the note. The pending list is written to `localStorage` per session, and the source passage is decorated with an absolutely positioned highlight and number badge.

Sending: capture phase listeners cover Enter, Ctrl/Cmd+Enter, and the send button (pointer down and keyboard click). Before submitting, the plugin strips any leftover block from the draft with `stripOldBlock`, then prepends the protocol block. A pure quote with an empty draft is submitted directly with `submit('queue')`; when the draft has text, the event returns to the composer and the host decides between Queue and Steer. An IME latch prevents the Enter that confirms a composition from attaching the block.

Cleanup: pending quotes clear only when the draft goes from non-empty to empty, which marks a confirmed send. A decoration scan acts as a fallback, so a leftover block cannot attach to the next message.

Reply decoration: once streaming ends and `data-streaming` is gone, the plugin strips inline think blocks, then replaces `Annotation N` labels with chips. Items come from the nearest previous annotated user message. Rows are decorated again when the host rebuilds a queued message bubble.

Multiple composers: the composer DOM carries no session marker, so with more than one `[data-composer-card]` on screen the plugin leaves the draft untouched and lets the host send it.

Slash skills: a slash draft is checked against the `remote.skills` list, cached for 60 seconds. On a match, the plugin appends a head only block after the command. Built-in commands keep their original behavior.

Maintenance: `patches/manifest.json` records 81 anchored operations, and `scripts/apply-patches.mjs` replays them onto a clean upstream `client.js` after a global terminology rename. Every anchor must match exactly once, so an upstream change fails loudly instead of applying silently. `--expect` compares the result byte for byte with a known good artifact.

Tests: `npm run check` parses the entry files. `npm test` runs the offline DOM suite on `node:test` and jsdom.

Diagnostics: filter the browser console for `[annotation]`. The logs cover block attachment, slash skill attachment, reply chip decoration, and early exits. An early exit with pending quotes reports its reason.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`cordis.patch.yml`](cordis.patch.yml): the profile layer and loader entry id.
- [`scripts/apply-patches.mjs`](scripts/apply-patches.mjs): replay tool for a new upstream base.
- [`patches/manifest.json`](patches/manifest.json): terminology mapping and anchored operations.
- [`test/client-load.test.mjs`](test/client-load.test.mjs): offline jsdom regression suite.
- [Upstream repository](https://github.com/omdsh-dev/dsh-annotation): the annotation plugin this fork is based on.

-----

<a id="model-experience"></a>
## Model Experience

The model sees the annotation block as plain text at the start of the user message. No system prompt or tool call is added. A message with one annotation and a follow-up question looks like this:

```
I annotated the following 1 passage(s) (the numbers match the quotes below); please respond to them when answering my question:

1. <quoted passage>
   Note: <your note>

Please respond to each annotation in the format "Annotation 1: …" through "Annotation 1: …", then answer my question.

Ask:
<your message>
```

A pure quote, meaning an empty draft, uses the shorter form below and has no `Ask:` marker:

```
I annotated the following passages; please respond to each annotation:

1. <quoted passage>

Please respond to each annotation above in the format "Annotation N: …".
```

The reply text keeps the `Annotation N` labels. The client turns them into chips in the DOM only, so the stored session keeps the original text.

#### KV Cache effect

The block is part of one user message and is sent once. It is not injected into later requests, and earlier messages are never rewritten. The chips in a reply are a DOM presentation, so they add no request content. Provider prefix caching continues as for any new user message. Switching the DSH locale changes only blocks composed after the switch.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only assistant replies can be annotated. Text in user messages is not selectable for annotation.
- The plugin depends on DSH Web DOM attributes such as `[data-chat-flow-kind="assistant-step"]`, `[data-composer-card]`, `[data-composer-input]`, and `[data-chat-anchor-key]`. A UI change can break selection, attachment, or chip decoration.
- With more than one composer on screen, for example an Agent Teams panel or an embedded subagent view, the plugin refuses to attach annotations and sends the message unchanged. It cannot tell which session a composer belongs to.
- Slash skills need the `remote.skills` list. When the service is absent, the list has not arrived, or the fetch fails, that message is sent without annotations and the annotations stay pending. Built-in slash commands never carry annotations and show a toast instead.
- Inline think stripping matches literal `<think>`, `<thinking>`, `<thought>`, and `<reasoning>` tags in text nodes. When the host renders a tag as HTML and only the reasoning text remains, the plugin has nothing to match.
- Pending annotations are stored in browser `localStorage`. They do not sync across browsers or devices, and clearing site data removes them.
- The annotation number, reply chip, and tip layers sit above the Agent Teams panel (z-index 110). With that panel open they can overlap its top edge and take clicks. Correcting the stacking needs an `elementFromPoint` occlusion check and real browser verification, so it is deferred.
- When the current session id cannot be resolved, the plugin leaves the draft untouched and logs one `[annotation]` warning. Attachment and cleanup are unavailable for that send.
- `npm test` needs Node >= 22.22.2 because jsdom 30 declares that range. `engines.node >= 20` covers the DSH host runtime rather than the test runner.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer context (click to expand)</summary>

`client.js` is edited directly and shipped as is. There is no build step; `npm run check` only parses the files.

When upstream publishes a new base version:

1. Fetch the clean `client.js` with `gh api repos/omdsh-dev/dsh-annotation/contents/client.js?ref=<commit>`, or pass `--fetch <commit>` to the script.
2. Run `node scripts/apply-patches.mjs --fetch <commit> --out client.js --expect client.js`.
3. Adapt the `find` anchor of any failing op in `patches/manifest.json`, keeping its semantics, then rerun.
4. Run `npm run check && npm test`, then smoke test Enter, Ctrl+Enter, a slash skill, and a reload in DSH Web.

The replay tool replays 81 anchored ops after the terminology rename from 批注 to 引用. Each anchor must match exactly once. Keep the `exports.name` in `client.js`, the package `name`, and the entry `name` in `cordis.patch.yml` identical.

`test/client-load.test.mjs` asserts that both READMEs carry the version from `package.json` and the op count from `patches/manifest.json`. Update both files together with the manifest.

`npm test` needs Node >= 22.22.2 for jsdom 30. The Node range in `engines` describes the DSH host runtime instead.

</details>
