# OpenAI Showcase submission copy

Official form: https://openai.com/form/showcase-submission/

The text below is written to fit the form's published character limits. Verify personal fields and the final public image URL before submission.

## About you

- First name: `[enter your first name]`
- Last name: `[enter your last name]`
- Email: `[enter your email]`
- Website: `https://github.com/runlinx-eng`

## About the project

### What type of project are you submitting?

```text
Open-source Chrome browser extension
```

### Did you use Codex to build this?

```text
Yes
```

### Did you use another coding agent to build this?

Use the factually correct answer. Recommended value if Codex was the only coding agent that materially changed the repository:

```text
No
```

### What is the tech stack?

```text
Chrome Extension Manifest V3, vanilla JavaScript, HTML, CSS, Chrome Storage, Chrome TTS, Web Speech, optional Python sync service and Swift companion package
```

### List use cases showcased

```text
Education, technical English learning, contextual vocabulary acquisition, personal knowledge tracking, browser productivity
```

### Which capability are you showcasing?

```text
Codex-assisted software development: evolving and validating a browser extension that performs local webpage text processing, contextual vocabulary interaction, learning-state tracking, and optional synchronization.
```

### Which OpenAI models and APIs are you using?

```text
N/A at runtime. Codex was used to build and refine the project; the extension itself does not call the OpenAI API.
```

### Are you using other models or APIs?

```text
No external AI model at runtime. The extension uses Chrome extension APIs, Chrome TTS, and the browser Web Speech API.
```

### Describe the building process

```text
I used Codex as an engineering agent to inspect an evolving personal extension, plan bounded changes, implement features, diagnose browser-extension edge cases, and validate syntax and user flows. Human decisions remained explicit while Codex handled code analysis, implementation, debugging, documentation, and repeatable checks.
```

## Project details

### Public GitHub repository

```text
https://github.com/runlinx-eng/TechWordLearn
```

### Hosted URL

Leave blank unless a stable public demo is added.

### Setup steps

```text
Clone or download the repository. In Chrome open chrome://extensions, enable Developer mode, choose Load unpacked, and select the repository root. Open an English technical webpage and refresh it. Hover a highlighted term for its definition, click for pronunciation, and use the popup or options page for statistics and vocabulary management.
```

### Project title

```text
TechWordLearn: Learn Technical English While You Browse
```

### Tagline

```text
A Chrome extension that highlights technical terms inside real webpages, explains and pronounces them in context, and turns repeated lookups into a personal learning record.
```

### Project description

```text
TechWordLearn helps people learn technical English without leaving the material they are already reading. It highlights recognized terms directly in documentation, articles, repositories, and product pages, then provides contextual definitions and pronunciation on demand.

The extension also tracks repeated lookups, supports custom and hidden vocabulary, and provides import, export, backups, version snapshots, browser sync, and optional self-hosted synchronization. Page matching happens locally, and no OpenAI API key is required at runtime.

Codex helped evolve the project from a personal browser tool into a more coherent, inspectable open-source prototype by supporting code analysis, bounded implementation, debugging, validation, and documentation.
```

### Author display name

Recommended public identity:

```text
runlinx-eng
```

Replace this with your preferred real name or social identity before submission if desired.

### Public cover image

Target path after adding the real screenshot:

```text
https://raw.githubusercontent.com/runlinx-eng/TechWordLearn/main/docs/showcase/techwordlearn-cover.png
```

Do not submit until that URL loads without authentication.
