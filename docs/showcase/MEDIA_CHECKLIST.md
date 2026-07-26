# Showcase media checklist

The official Showcase form requires a public cover-image URL. A real product screenshot is preferable to a generated mockup.

## Required cover image

Create:

```text
docs/showcase/techwordlearn-cover.png
```

Recommended composition:

- 16:9 landscape image
- At least 1600 × 900
- A real English technical webpage
- Several visible highlighted terms
- One open definition tooltip
- The TechWordLearn popup visible at the side, if possible
- No personal tabs, bookmarks, account names, tokens, private URLs, or unrelated notifications
- No OpenAI or Chrome branding that implies endorsement

The screenshot should communicate the product in one glance:

> Technical terms are highlighted inside real reading, with definitions and learning signals available without leaving the page.

## Suggested demonstration page

Use a public documentation or educational page whose content is safe to reproduce in a screenshot. Avoid private repositories, paid content, inboxes, dashboards, or pages containing personal identity.

## 45–60 second demo script

**0–5 seconds**

Show the extension loaded in Chrome and state: “TechWordLearn helps me learn technical English while reading real technical content.”

**5–18 seconds**

Open a technical page. Point to highlighted terms and hover one to show its definition.

**18–27 seconds**

Play pronunciation and mark or interact with the word.

**27–38 seconds**

Open the popup and show total or weekly lookup statistics.

**38–50 seconds**

Open vocabulary management, add a custom term, and save it.

**50–60 seconds**

Refresh the page, show the new term highlighted, and close with: “Built as an open-source Chrome extension with Codex assisting development.”

## Public URL check

After committing and pushing the image, verify this URL in a private browser window:

```text
https://raw.githubusercontent.com/runlinx-eng/TechWordLearn/main/docs/showcase/techwordlearn-cover.png
```
