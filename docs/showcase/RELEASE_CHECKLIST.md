# Showcase release checklist

## Repository presentation

- [ ] Replace the repository README with the prepared `README.md`
- [ ] Replace the obsolete public `PROJECT.md` with the prepared project overview
- [ ] Add `PRIVACY.md`
- [ ] Add `docs/showcase/SUBMISSION.md`
- [ ] Add `docs/showcase/MEDIA_CHECKLIST.md`
- [ ] Add a real `docs/showcase/techwordlearn-cover.png`
- [ ] Confirm every README claim matches current code
- [ ] Confirm no local paths, tokens, secrets, or internal-only instructions are published

## GitHub About

Suggested description:

```text
Learn technical English while browsing: in-page term highlights, contextual definitions, pronunciation, lookup tracking, and personal vocabulary.
```

Suggested topics:

```text
chrome-extension
technical-english
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

- [ ] `node --check background.js content.js popup.js options.js`
- [ ] Load from a fresh Chrome profile
- [ ] Open a normal HTTPS technical page
- [ ] Verify highlight, tooltip, and pronunciation
- [ ] Verify popup statistics
- [ ] Add, edit, hide, and restore a term
- [ ] Export and re-import vocabulary JSON
- [ ] Confirm cloud sync is not enabled without an explicit user choice
- [ ] Inspect the extension service worker for errors
- [ ] Verify the cover image loads publicly
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
