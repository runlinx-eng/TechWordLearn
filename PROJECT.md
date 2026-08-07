# Project: TechWordLearn

## Position

TechWordLearn is a public, open-source technical-English immersion project centered on a Chrome extension.

It helps a user learn technical vocabulary while reading real webpages by highlighting terms, showing definitions, providing pronunciation, tracking lookups, and maintaining a personal vocabulary.

## Current status

```yaml
status: working_open_source_prototype
primary_surface: Chrome Extension
runtime_openai_api: none
public_repository: https://github.com/runlinx-eng/TechWordLearn
distribution:
  chrome_web_store: false
  hosted_saas: false
  local_unpacked_install: true
```

This status does not claim production readiness or Chrome Web Store approval. The repository is suitable for local installation, demonstration, inspection, and continued iteration.

## Product scope

Current product capabilities include:

- webpage term highlighting;
- hover definitions;
- pronunciation;
- total and weekly lookup statistics;
- custom vocabulary management;
- hidden and restored terms;
- vocabulary backups and repository snapshots;
- JSON import/export;
- manual Chrome profile sync with revision, chunk, and hash validation;
- optional self-hosted cloud sync, triggered only by the user.

## Sources of truth

- Extension contract and permissions: `manifest.json`
- Runtime behavior: JavaScript, HTML, and CSS in the repository
- Baseline vocabulary: `vocabulary.json`
- Vocabulary history: `vocab_versions/`
- User-facing operation: `README.md` and `docs/`
- Privacy explanation: `PRIVACY.md`
- Version identity: `manifest.json`

Documentation must not claim a capability that the current code does not implement.

## Product boundaries

- The extension does not require an OpenAI API key.
- Codex may assist development but cannot make the user's final product decisions.
- Page text is processed locally for matching and highlighting.
- Cloud synchronization is optional and must use a user-configured endpoint.
- No synchronization path may poll or directly modify browser LevelDB files.
- Profile and self-hosted synchronization must begin with an explicit user action.
- No credentials or tokens may be committed.
- Generated release artifacts and local runtime state are not source truth.
- The project does not claim Chrome Web Store publication, hosted service availability, or production support.

## External presentation

For public presentation, lead with the user problem and visible workflow:

> Learn technical English while reading real technical content.

Public documentation should focus on the user problem, visible product behavior, installation, privacy, and current capabilities. Historical implementation details remain available through Git history.

## Validation

Minimum static validation:

```bash
node --check background.js content.js popup.js manual-sync.js options.js
node --test tests/manual-sync.test.cjs
```

Minimum manual validation in a fresh Chrome profile:

1. Load the repository as an unpacked extension.
2. Open an HTTPS technical webpage.
3. Verify highlighting and hover definitions.
4. Verify pronunciation.
5. Verify popup statistics.
6. Add and remove a custom term.
7. Verify import/export.
8. Confirm Chrome profile sync does nothing until a manual button is clicked.
9. Confirm optional cloud sync is off unless configured and is still button-triggered when configured.
10. Inspect the extension service worker for unexpected errors or sync alarms.

## Current priorities

1. Add a real product screenshot and short demo recording.
2. Verify installation in a fresh Chrome profile.
3. Publish a stable GitHub release ZIP if desired.
4. Submit the project to the OpenAI Showcase.
5. Collect feedback before expanding product scope.
