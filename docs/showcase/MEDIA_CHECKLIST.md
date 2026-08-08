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

> 最实用的生词，会自己冒出来等我消灭。

## Suggested demonstration page

Use a public documentation or educational page whose content is safe to reproduce in a screenshot. Avoid private repositories, paid content, inboxes, dashboards, or pages containing personal identity.

## Core story

The demo is not a feature tour. Use the canonical product language:

> 产品定义：真实阅读驱动的动态生词表。
>
> 核心价值：把有限注意力持续给当前最值得记的词。
>
> 主口号：最实用的生词，会自己冒出来等我消灭。
>
> 机制口号：记住一个，下一批自然顶上来。

The user does not begin with a generic vocabulary list and does not manually rank words. Words encountered in real GitHub pages, technical documentation, AI articles, and other daily reading accumulate point-reading counts. The highest counts rise to the top of the popup and “我的词库”.

The final shot must give the first three words the strongest visual emphasis. People naturally notice and remember the top three positions, so the demo should make the next learning decision feel immediate:

```text
1  evidence     点读 55
2  routing      点读 51
3  domain       点读 33
```

The intended takeaway is:

> 不用先背别人整理的词表。正常阅读一段时间，最实用、最需要注意的生词会自己排到前面；先记前三个就够了。

## 45–60 second demo script

**0–8 seconds — normal reading, no study setup**

Quickly move through a public GitHub repository, technical documentation, and an AI article. The user is simply reading, not opening a vocabulary course or choosing a prepared word list.

On-screen text:

> 不用先背词表

**8–22 seconds — useful words keep returning**

Show `evidence`, `routing`, and `domain` appearing in real context. Hover briefly for meaning and click unfamiliar words for pronunciation. Use quick time jumps to suggest this happens naturally across ordinary reading sessions.

On-screen text:

> 遇到最多、又反复点读的词，最值得注意

**22–36 seconds — the priority list appears**

Open the TechWordLearn popup. Let the ranked list settle into view, then open “我的词库” to show that the same words remain ordered by point-reading count without manual sorting.

**36–50 seconds — remember the top three**

Dim the rest of the list and reveal the first three positions one by one:

```text
1  evidence     点读 55
2  routing      点读 51
3  domain       点读 33
```

On-screen text:

> 今天先记这三个

**50–60 seconds — close on the product value**

Return briefly to the real webpage, then end on:

> 最实用的生词，会自己冒出来等我消灭。
>
> 记住一个，下一批自然顶上来。

Avoid spending the core demo on backup, synchronization, version history, server settings, or implementation details. Those capabilities may appear in separate supporting material, but they weaken this story.

## Public URL check

After committing and pushing the image, verify this URL in a private browser window:

```text
https://raw.githubusercontent.com/runlinx-eng/TechWordLearn/main/docs/showcase/techwordlearn-cover.png
```
