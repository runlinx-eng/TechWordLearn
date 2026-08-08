# TechWordLearn Project Guide

## Position

TechWordLearn is a Manifest V3 Chrome extension that turns real webpage reading into a dynamic personal vocabulary list. Words the user repeatedly point-reads rise to the top, keeping limited attention on what is most worth learning now.

Product semantics are canonical in `PRODUCT.md`; `product.json` is its machine-readable projection. Do not infer product priority only from feature count or code size. `PROJECT.md` owns project scope and status; `README.md` owns user-facing setup and operation.

## Run and validate

There is no build step for the extension. Load the repository root through `chrome://extensions/` → **Load unpacked**.

Before handing off a change, run:

```bash
for file in background.js content.js popup.js manual-sync.js options.js; do node --check "$file"; done
node --test tests/*.test.cjs
python3 -m json.tool manifest.json >/dev/null
git diff --check
```

Use `bash scripts/package-extension.sh <output-dir>` only when a package is needed. Test browser behavior in an isolated Chrome profile; machine checks are not user acceptance.

## Stack and structure

- Vanilla JavaScript, HTML, and CSS; Chrome Extension Manifest V3.
- `content.js` handles page matching and interactions.
- `background.js` handles TTS, reinjection, context menus, and explicit self-hosted sync.
- `options.*` owns the vocabulary-management UI; `popup.*` owns quick statistics and controls.
- `manual-sync.js` owns manual Chrome multi-device snapshot validation.
- `vocabulary.json` is the baseline vocabulary; `vocab_versions/` contains repository snapshots.

## Durable boundaries

- Browser storage is accessed only through supported Chrome APIs. Never poll, parse, or write a live browser LevelDB database.
- Chrome is the supported browser surface. Do not add Atlas-specific storage paths, synchronization, or compatibility code.
- Chrome and self-hosted synchronization remain fully manual; do not add startup, timer, alarm, or change-listener sync.
- Keep the main vocabulary page focused on search, browsing, and explicit word actions. Statistics, sync, history, and backup maintenance remain secondary surfaces.
- User-facing copy says “导入备份 / 导出备份”; JSON is only the file format.
- Do not commit credentials, local browser state, generated packages, dependencies, or build output.

## Current state and release boundary

Version identity is in `manifest.json`. The current product is a locally installable open-source prototype, not a Chrome Web Store release or hosted SaaS. Every future release still requires fresh-profile manual verification and separately authorized commit, push, and release actions; a pushed GitHub revision is not Chrome Web Store publication or human acceptance.
