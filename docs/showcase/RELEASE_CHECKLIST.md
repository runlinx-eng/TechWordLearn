# Showcase release checklist

## Repository presentation

- [ ] Replace the repository README with the prepared `README.md`
- [ ] Replace the obsolete public `PROJECT.md` with the prepared project overview
- [ ] Add `PRIVACY.md`
- [ ] Add `docs/showcase/SUBMISSION.md`
- [ ] Add `docs/showcase/MEDIA_CHECKLIST.md`
- [ ] Add the three README demo GIFs under `docs/showcase/`
- [ ] Keep `docs/showcase/techwordlearn-cover.png` available for external showcase use
- [ ] Confirm every README claim matches current code
- [ ] Confirm no local paths, tokens, secrets, or internal-only instructions are published

## GitHub About

Suggested description:

```text
真实阅读驱动的动态生词表：最实用的生词会自己冒出来，记住一个，下一批自然顶上来。
```

Suggested topics:

```text
chrome-extension
contextual-learning
language-learning
vocabulary
education
browser-extension
javascript
codex
open-source
```

GitHub About fields must be changed manually in the repository interface.

## Validation

- [ ] `for file in background.js content.js popup.js manual-sync.js options.js; do node --check "$file"; done`
- [ ] `node --test tests/*.test.cjs`
- [ ] Load from a fresh Chrome profile
- [ ] Open a normal HTTPS technical page
- [ ] Verify highlight, tooltip, and pronunciation
- [ ] Verify popup statistics
- [ ] Add, edit, hide, and restore a term
- [ ] Export and re-import a vocabulary backup
- [ ] Verify mastered words survive backup import, version restore, Chrome manual sync, and self-hosted manual sync
- [ ] Confirm cloud sync is not enabled without an explicit user choice
- [ ] Inspect the extension service worker for errors
- [ ] Verify the three README GIFs and cover image load publicly
- [ ] Verify README links in a private browser window

## Optional GitHub release

- [ ] Run the existing packaging script
- [ ] Inspect the ZIP contents
- [ ] Exclude tokens, local state, caches, and unrelated files
- [ ] Create a versioned release matching `manifest.json`
- [ ] Test installation from the release ZIP

A GitHub release is useful but is not required by the OpenAI Showcase form when a public repository is supplied.

## Submission

- [ ] Review `docs/showcase/SUBMISSION.md`
- [ ] Replace personal placeholders
- [ ] Confirm coding-agent answers are factually correct
- [ ] Confirm the public cover URL
- [ ] Read the current OpenAI Showcase agreement
- [ ] Submit only after the repository's public `main` branch contains the referenced files
