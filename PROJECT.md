# Project: TechWordLearn

## Position

TechWordLearn is a public, open-source, real-reading-driven dynamic vocabulary list centered on a Chrome extension.

Its core value is to keep the user's limited attention on the words most worth remembering now. Words repeatedly point-read during normal webpage reading rise to the top; when one is mastered, the next group naturally takes its place.

Canonical product language:

> 产品定义：真实阅读驱动的动态生词表。
>
> 核心价值：把有限注意力持续给当前最值得记的词。
>
> 主口号：最实用的生词，会自己冒出来等我消灭。
>
> 机制口号：记住一个，下一批自然顶上来。

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

- webpage word highlighting;
- hover definitions;
- pronunciation;
- total and weekly point-reading statistics;
- custom vocabulary management;
- hidden and restored terms;
- mastered-word state retained by backups, version restore, and manual synchronization;
- vocabulary backups and repository snapshots;
- backup import/export, using JSON as the on-disk format;
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

For public presentation, lead with the changing personal priority list rather than generic highlighting:

> 最实用的生词，会自己冒出来等我消灭。

Public documentation should show how normal reading produces a ranked list, how the top words receive attention first, and how mastering one lets the next group rise naturally. GitHub, technical documentation, and AI articles are initial use cases, not the product definition. Historical implementation details remain available through Git history.

## Validation

Minimum static validation:

```bash
for file in background.js content.js popup.js manual-sync.js options.js; do node --check "$file"; done
node --test tests/*.test.cjs
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

1. Keep the dynamic vocabulary surface lightweight: the words most worth learning now come first, explicit word actions come second, and maintenance functions remain secondary.
2. Verify the complete extension flow in a fresh Chrome profile before any release decision.
3. Treat a demo recording, GitHub release ZIP, and Showcase submission as optional, separately authorized publication work.
4. Collect feedback before expanding product scope.
