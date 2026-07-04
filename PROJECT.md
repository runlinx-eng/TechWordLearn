# Project: TechWordLearn

## Project Goal

TechWordLearn is a technical English immersion learning project centered on a Chrome Extension. It highlights technical English words on pages, provides hover definitions, supports pronunciation, tracks lookup counts, manages custom vocabulary, and supports vocabulary versioning and sync workflows.

The repository also includes a Swift/macOS companion package and local / cloud vocabulary sync helpers.

## Current Stage

prototype / personal tool / non-production repo

This classification is provisional and must be confirmed by the human owner before formal onboarding.

## Business / Personal Context

Personal learning and vocabulary management tool. It should support safe iterative improvement without exposing browser secrets, cloud sync tokens, local vault data, or production systems.

## Allowed Read Scope

Allowed after human approval:
- `README.md`
- `LICENSE`
- `manifest.json`
- `.gitignore`
- `docs/`
- non-sensitive JavaScript source files such as `background.js`, `content.js`, `popup.js`, `options.js`
- non-sensitive HTML / CSS files such as `popup.html`, `options.html`, `styles.css`, `options.css`
- non-sensitive script files under `scripts/`
- `vocabulary.json` and `vocab_versions/` only when the task explicitly concerns vocabulary behavior or docs
- `macos-word-entropy/Package.swift`
- non-sensitive Swift source and tests under `macos-word-entropy/Sources/` and `macos-word-entropy/Tests/`

Read-only scans must skip dependency, build, release, cache, and git-internal directories unless explicitly approved.

## Allowed Write Scope

Current Phase 9: none inside `/Users/zj1-6/Desktop/TechWordLearn`.

Future first-task recommendation after human approval and worktree creation:
- documentation files;
- README / docs updates;
- non-production source files directly named in the approved task;
- tests directly named in the approved task;
- config examples that do not contain secrets.

## Forbidden Paths

Always forbidden unless explicitly authorized in a later phase:
- `.env`
- `.env.*`
- files or paths containing `secret`
- files or paths containing `credential`
- files or paths containing `token`
- private keys
- `id_rsa`
- `*.pem`
- `*.key`
- wallets
- vault
- production database dumps
- customer-sensitive data
- `node_modules`
- `.git` internals
- build artifacts
- release artifacts unless the task is explicitly release review
- `dist`
- `build`
- `.next`
- `coverage`
- `.turbo`
- `.cache`
- `macos-word-entropy/.build`
- `macos-word-entropy/.swiftpm`

## Allowed Commands

Current Phase 9 allowed commands were read-only only:
- `ls`
- `find` with bounded `maxdepth`
- `sed` / `cat` for safe docs and non-sensitive metadata
- `git status --short`

Candidate future read-only commands after approval:
- `git status --short`
- `git diff --stat`
- `git diff -- README.md docs/ manifest.json`
- file listing with bounded depth and dependency/build exclusions

Candidate future validation commands after explicit approval, not executed in Phase 9:
- `node --check background.js content.js popup.js options.js`
- Chrome manual extension loading checklist
- `swift test` inside `macos-word-entropy/`, only if Swift tooling and dependency behavior are approved

## Forbidden Commands

- `rm -rf`
- sudo destructive commands
- production deploy
- production migration
- direct push to main
- secret extraction
- dependency install without approval
- test/build without approval in this phase
- starting local bridge services without approval
- starting cloud sync services without approval
- running release packaging without approval
- modifying LaunchAgents without approval
- reading `.env` or credential files

## Test Commands

Candidate commands, not executed:
- `node --check background.js content.js popup.js options.js`
- manual Chrome extension load through `chrome://extensions/`
- manual smoke test: highlight, tooltip, pronunciation, popup stats, options vocabulary edit
- `cd macos-word-entropy && swift test`

## Lint / Typecheck Commands

Candidate commands, not executed:
- `node --check background.js content.js popup.js options.js`
- Swift package compile / test checks only after explicit approval

No `package.json` was observed during Phase 9, so no `npm test`, `npm run lint`, or `npm run typecheck` command is currently defined.

## Acceptance Criteria

For the first low-risk task:
- scope is documentation-only or clearly non-production;
- changes occur only in a dedicated git worktree after human approval;
- forbidden paths remain untouched;
- no secrets are read;
- no cloud sync token is exposed;
- no service is started;
- no dependency install occurs without approval;
- candidate validation commands are approved before execution;
- diff is small and reviewable;
- rollback plan is documented;
- results are written back to CognitiveSystem.

## Rollback Plan

For future work:
- use a dedicated git worktree and branch;
- keep changes scoped to approved files;
- review `git diff` before approval;
- discard the worktree or branch if rejected;
- do not alter main directly;
- do not deploy or package releases during initial onboarding.

## Result Writeback Path

Default:

/Users/zj1-6/CognitiveSystem/07_project_memory/TechWordLearn/

/Users/zj1-6/CognitiveSystem/04_results/

## Human Approval Checklist

- Human confirms this project is appropriate for low-risk onboarding.
- Human reviews this PROJECT.md draft.
- Human approves writing PROJECT.md into project root.
- Human approves allowed read scope.
- Human approves allowed write scope.
- Human approves forbidden paths.
- Human approves test / lint / typecheck commands.
- Human approves rollback plan.
- Human approves worktree strategy.
- Human confirms no secrets should be read.
- Human approves the first concrete task.
