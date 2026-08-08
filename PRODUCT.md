# TechWordLearn Product Semantics

This document is the canonical source for TechWordLearn's product meaning,
causal model, and priority. `PROJECT.md` owns project scope and status;
`README.md` owns user-facing setup and operation; runtime code remains the
authority for what the current version actually does.

If product intent and runtime behavior disagree, report the mismatch. Do not
silently redefine the product from feature count, code size, or an old snapshot.

## Human definition

> 产品定义：真实阅读驱动的动态个人生词表。
>
> 核心价值：把有限注意力持续给当前最值得记的词。
>
> 主口号：最实用的生词，会自己冒出来等我消灭。
>
> 机制口号：记住一个，下一批自然顶上来。

## One-line definition

TechWordLearn is a dynamic personal vocabulary list driven by real reading
behavior.

## Why it exists

The user should not have to plan which words to memorize first. Normal reading
creates real occasions of need, and repeated point-reading turns those occasions
into a personal attention priority. The words that still demand the most help
remain easiest to notice.

## Core loop

```text
add unknown word
→ keep it highlighted during real reading
→ point-read when help is needed
→ accumulate point-read count
→ raise its attention priority
→ mark it mastered
→ remove it from highlighting and the current attention queue
→ surface the next priority words
```

Compact form:

```text
add → highlight → point-read → rank → master → leave queue → next word rises
```

## Core feedback loop

Ranking is not an auxiliary statistics feature. Ranking plus mastered-word exit
is the core learning feedback loop. Highlighting, definitions, pronunciation,
and word addition support that loop.

The user-facing result is continuous replacement, not unlimited accumulation:
learn one priority word, remove it from current attention, and let the next word
take its place.

## State meaning

| Concept | Product meaning |
| --- | --- |
| `active` | A word in the effective vocabulary that is not hidden or mastered and still belongs in the current attention pool. |
| `point_read_count` | An explicit behavior signal recorded when the user clicks a highlighted word for pronunciation during real reading. It is not a passive page-appearance count. |
| `rank` | A derived learning-attention priority, not a separately stored user order. The popup prefers the current natural week's point-read counts and falls back to cumulative counts when the week is empty. Ties are alphabetical. |
| `mastered` | The user says the word no longer needs current attention. It leaves webpage highlighting and the popup priority queue; historical point-read counts remain. |
| `hidden` | The user removes a word from the effective vocabulary. Hidden is a vocabulary-management state, not evidence that the word was learned. |

## Product invariant

The most repeatedly point-read active words should remain the easiest words to
notice and act on. Mastering a word must remove it from the current attention
queue without erasing the behavior history that produced its priority.

## Product hierarchy

### Core

- enter a real unknown word into the loop;
- preserve it as a visible reading cue;
- convert repeated point-reading into attention priority;
- remove mastered words from current attention;
- refill the priority positions with the next words.

### Supporting interaction

- webpage highlighting;
- contextual Chinese definitions;
- pronunciation;
- adding and editing words.

### Non-core infrastructure

- multi-device synchronization;
- backup import and export;
- version history and restore;
- maintenance views and detailed statistics;
- self-hosted transport.

These capabilities may protect or explain the learning loop, but they must not
replace it as the main product story or dominate the primary interface.

## Not the product

- not a static word list;
- not a traditional memorization course;
- not only a webpage translation or pronunciation tool;
- not a statistics dashboard;
- not the field of “technical English” itself.

The supported domain is general English webpage reading. The current bundled
vocabulary has a clear technical bias because GitHub, documentation, and AI
articles were the first use cases; that bias is not the product boundary.

## Agent decision rule

Do not infer product priority from feature count or code size. When proposing,
reviewing, or changing TechWordLearn, first preserve the complete loop:

```text
real reading → point-read signal → attention ranking → mastered exit → refill
```

The structured projection of this document is `product.json`.
