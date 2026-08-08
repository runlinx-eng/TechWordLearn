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

The popup must keep the first three words visually clear throughout the demo. Use deliberately small, unequal counts so viewers can follow every move in one pass:

```text
1  evidence     点读 3
2  domain       点读 2
3  approval     点读 1
```

After `evidence` is mastered, the ending becomes:

```text
1  domain       点读 2
2  approval     点读 1
3  provider     点读 1
```

The intended takeaway remains:

> 不用先背别人整理的词表。正常阅读一段时间，最实用、最需要注意的生词会自己排到前面；先记前三个就够了。

## 14-second demo script

**0–2 seconds — add one real word**

Select `evidence` on a quiet English page, choose “加入词库” from the context menu, and let the word turn yellow. Keep the real popup visible in the upper-right corner.

On-screen text:

> 选中生词，右键加入词库

**2–11 seconds — repeated point-reading raises priority**

Show `evidence` again three times. Each repetition uses a strict three-second attention handoff: for the first second, only the left page click and pronunciation cue move while the ranking stays still; for the next two seconds, the left side stays still while the right panel shows `点读 +1`, changes the count, moves the row when needed, and holds the result. Use only two or three supporting words so the cause is unmistakable.

Do not use a bottom caption, an upward arrow, blur, or an extra enlargement. The only transient labels are attached to the action itself:

> 点击听读音 → 播放读音
>
> 点读 +1

**11–14 seconds — master one and refill the list**

Use `Option / Alt + 点击` on the first-ranked word, accept the confirmation, and show it leaving the current ranking. The next two words move up and a new third word enters.

On-screen text:

> 记住一个，下一批自然顶上来。

Avoid spending the core demo on backup, synchronization, version history, server settings, or implementation details. Those capabilities may appear in separate supporting material, but they weaken this story.

## Public URL check

After committing and pushing the image, verify this URL in a private browser window:

```text
https://raw.githubusercontent.com/runlinx-eng/TechWordLearn/main/docs/showcase/techwordlearn-cover.png
```
