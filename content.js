// ============================================
// TechWordLearn - Content Script (Full Replace)
// ============================================

(() => {
  // 防止重复注入导致重复绑定事件
  if (window.__techwordlearn_loaded__) return;
  window.__techwordlearn_loaded__ = true;

  let vocabulary = {};
  let masteredWords = new Set();

  const vocabUrl = chrome.runtime.getURL("vocabulary.json");
  const SUFFIXES = ["ing", "ed", "es", "s", "d", "ly"];

  // --- Tooltip (single global) ---
  let tooltipEl = document.getElementById("neural-tooltip-container");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "neural-tooltip-container";
    document.body.appendChild(tooltipEl);
  }

  let compiled = null; // { testRegex, replaceRegex, usesBoundaryCapture }
  let scanTimer = null;

  let hoverSeq = 0; // 防止异步 storage 回调串台

  // --- Stable TTS (fix low/hoarse voice on macOS/Chrome) ---
  let __tts_inited = false;
  let __tts_voice = null;
  let __tts_lastSpeakAt = 0;

  function __tts_pickVoice(voices) {
    // macOS 常见更清晰的英文音色优先
    return (
      voices.find((v) => v.lang === "en-US" && /Samantha/i.test(v.name)) ||
      voices.find((v) => v.lang === "en-US" && /Alex/i.test(v.name)) ||
      voices.find((v) => v.lang === "en-US") ||
      voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) ||
      voices[0] ||
      null
    );
  }

  function __tts_initOnce() {
    if (__tts_inited) return;
    __tts_inited = true;

    const load = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      __tts_voice = __tts_pickVoice(voices);
      // 调试需要可以打开：
      // console.log("[TTS voice]", __tts_voice?.name, __tts_voice?.lang);
    };

    // 先尝试加载一次
    load();
    // voices 可能异步到达
    window.speechSynthesis.addEventListener("voiceschanged", load);
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeWord(raw) {
    // 只取第一个英文单词，过滤标点/奇怪空格
    const m = String(raw).match(/[A-Za-z][A-Za-z'-]*/);
    return m ? m[0].toLowerCase() : null;
  }

  function isSkippableTextNode(node) {
    const p = node.parentNode;
    if (!p) return true;
    if (p.nodeName === "SCRIPT" || p.nodeName === "STYLE") return true;
    if (p.isContentEditable) return true;
    if (p.closest && p.closest("#neural-tooltip-container")) return true;
    if (p.closest && p.closest(".tech-word-highlight")) return true;
    // input/textarea 内的文本不处理（通常也拿不到 text node，但保险）
    if (p.closest && p.closest("textarea, input")) return true;
    return false;
  }

  function compileMatchers() {
    const activeWords = Object.keys(vocabulary).filter((w) => !masteredWords.has(w));
    if (activeWords.length === 0) {
      compiled = null;
      return;
    }

    const alts = activeWords
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");

    // 优先用 lookbehind/ lookahead：位置索引干净
    // 目标：允许 Influence_Score 这种（_ 不算字母边界），但避免匹配到 longerWordInside
    const patternLook = `(?<![A-Za-z])(${alts})(?:s|es|d|ed|ing|ly)?(?![A-Za-z])`;

    try {
      compiled = {
        testRegex: new RegExp(patternLook, "i"),
        replaceRegex: new RegExp(patternLook, "gi"),
        usesBoundaryCapture: false,
      };
      return;
    } catch (e) {
      // 极老 Chrome 才会走到这里：无 lookbehind fallback（包含边界字符，需要手动跳过）
      const patternCap = `(^|[^A-Za-z])(${alts})(?:s|es|d|ed|ing|ly)?(?=[^A-Za-z]|$)`;
      compiled = {
        testRegex: new RegExp(patternCap, "i"),
        replaceRegex: new RegExp(patternCap, "gi"),
        usesBoundaryCapture: true,
      };
    }
  }

  function findRootInVocab(wordLower) {
    if (vocabulary[wordLower]) return wordLower;
    for (const suf of SUFFIXES) {
      if (wordLower.endsWith(suf)) {
        const stem = wordLower.slice(0, -suf.length);
        if (vocabulary[stem]) return stem;
      }
    }
    return null;
  }

  function unwrapSpanKeepChildren(span) {
    const parent = span.parentNode;
    if (!parent) return;
    const frag = document.createDocumentFragment();
    while (span.firstChild) frag.appendChild(span.firstChild);
    parent.replaceChild(frag, span);
  }

  function hideTooltip() {
    tooltipEl.classList.remove("active");
  }

  // --- Hover + Click delegation (works even if highlight wraps <i>/<code> etc) ---
  function onMouseOver(e) {
    const span = e.target && e.target.closest ? e.target.closest(".tech-word-highlight") : null;
    if (!span) return;

    const key = span.dataset.key;
    if (!key || !vocabulary[key]) return;

    const def = vocabulary[key];
    const my = ++hoverSeq;

    chrome.storage.local.get([key], (res) => {
      if (my !== hoverSeq) return;

      const count = res[key] || 0;
      tooltipEl.innerText = `${def}\n[Seen: ${count}]`;

      const r = span.getBoundingClientRect();
      tooltipEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 260))}px`;
      tooltipEl.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 60)}px`;
      tooltipEl.classList.add("active");
    });
  }

  function onMouseOut(e) {
    // 只在“离开高亮 span 本体”时隐藏，避免 document 级 mouseout 冒泡误伤
    const fromSpan = e.target && e.target.closest ? e.target.closest(".tech-word-highlight") : null;
    if (!fromSpan) return;

    const toSpan =
      e.relatedTarget && e.relatedTarget.closest
        ? e.relatedTarget.closest(".tech-word-highlight")
        : null;

    // 从一个高亮移到另一个高亮：不隐藏（mouseover 会更新 tooltip）
    if (toSpan) return;

    hideTooltip();
  }

  function onClick(e) {
    const span = e.target && e.target.closest ? e.target.closest(".tech-word-highlight") : null;
    if (!span) return;

    const key = span.dataset.key;
    if (!key) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.altKey) {
      markAsMastered(key);
      return;
    }

    // speak + count
    speakText((span.textContent || key).trim());
    updateWordCount(key);
  }

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);

  function updateWordCount(word) {
    chrome.storage.local.get([word], (result) => {
      const newCount = (result[word] || 0) + 1;
      chrome.storage.local.set({ [word]: newCount });
    });
  }

  function speakText(text) {
    try {
      __tts_initOnce();

      const now = Date.now();
      // 防止极少数情况下同一次点击触发多次 speak，听起来会“糊/沙哑”
      if (now - __tts_lastSpeakAt < 180) return;
      __tts_lastSpeakAt = now;

      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.0;
      u.pitch = 1.12; // 想更亮：1.15~1.2；想更自然：1.0
      u.volume = 1.0;
      if (__tts_voice) u.voice = __tts_voice;

      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function markAsMastered(word) {
    if (!confirm(`标记为已掌握：${word}?`)) return;

    masteredWords.add(word);
    chrome.storage.local.set({ mastered_list: Array.from(masteredWords) });

    // 重要：保留原格式（斜体/代码），不要直接替换成纯文本
    const spans = document.querySelectorAll(
      `.tech-word-highlight[data-key="${CSS.escape(word)}"]`
    );
    spans.forEach(unwrapSpanKeepChildren);

    hideTooltip();
    hoverSeq++;
    compileMatchers();
    compileMatchers();
  }

  // --- Highlight pass 1: single text node replace (fast) ---
  function highlightWithinTextNodes(root) {
    if (!compiled) return;

    const { testRegex, replaceRegex, usesBoundaryCapture } = compiled;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];

    while ((node = walker.nextNode())) {
      if (isSkippableTextNode(node)) continue;
      if (!node.nodeValue || node.nodeValue.trim() === "") continue;
      if (testRegex.test(node.nodeValue)) nodes.push(node);
    }

    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      const frag = document.createDocumentFragment();

      let last = 0;
      replaceRegex.lastIndex = 0;

      let m;
      while ((m = replaceRegex.exec(text)) !== null) {
        const full = m[0];
        const matchStart = m.index;

        const boundary = usesBoundaryCapture ? (m[1] || "") : "";
        const wordPart = usesBoundaryCapture ? full.slice(boundary.length) : full;

        const wordStart = matchStart + boundary.length;
        const wordEnd = matchStart + full.length;

        // 前面的普通文本（不含 boundary）
        const before = text.slice(last, matchStart);
        if (before) frag.appendChild(document.createTextNode(before));

        // boundary 单独放回去
        if (boundary) frag.appendChild(document.createTextNode(boundary));

        const dictKey = findRootInVocab(wordPart.toLowerCase());
        if (dictKey && !masteredWords.has(dictKey)) {
          const span = document.createElement("span");
          span.className = "tech-word-highlight";
          span.dataset.key = dictKey;
          span.appendChild(document.createTextNode(wordPart)); // 单节点替换：这里是纯文本
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(wordPart));
        }

        last = wordEnd;
      }

      const rest = text.slice(last);
      if (rest) frag.appendChild(document.createTextNode(rest));

      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // --- Highlight pass 2: cross-node (italic/code splits) using Range (keeps formatting) ---
  const BLOCK_SELECTOR = "p,li,td,th,blockquote,pre,code,h1,h2,h3,h4,h5,h6";

  function collectTextNodesIn(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = w.nextNode())) {
      if (isSkippableTextNode(n)) continue;
      if (!n.nodeValue || n.nodeValue.length === 0) continue;
      out.push(n);
    }
    return out;
  }

  function locateByIndex(nodes, prefixLens, idx) {
    // idx in [0, total]
    let lo = 0,
      hi = nodes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = prefixLens[mid];
      const end = start + nodes[mid].nodeValue.length;
      if (idx < start) hi = mid - 1;
      else if (idx >= end) lo = mid + 1;
      else return { node: nodes[mid], offset: idx - start };
    }
    // idx==total -> end at last node
    if (nodes.length) {
      const last = nodes[nodes.length - 1];
      return { node: last, offset: last.nodeValue.length };
    }
    return null;
  }

  function highlightAcrossNodesInBlock(block) {
    if (!compiled) return;

    // 只对“可能被拆分”的块做：有子元素（斜体/代码高亮一般会产生）
    if (!block.querySelector || block.querySelectorAll("*").length === 0) return;

    const nodes = collectTextNodesIn(block);
    if (nodes.length < 2) return;

    // 太大就跳过（性能）
    let totalLen = 0;
    const prefix = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      prefix[i] = totalLen;
      totalLen += nodes[i].nodeValue.length;
      if (totalLen > 50000) return;
    }

    // 拼接渲染文本
    const combined = nodes.map((n) => n.nodeValue).join("");

    const { replaceRegex, usesBoundaryCapture } = compiled;

    // 收集 matches（用 exec），然后从后往前包裹，避免索引失效
    const matches = [];
    replaceRegex.lastIndex = 0;
    let m;
    while ((m = replaceRegex.exec(combined)) !== null) {
      const full = m[0];
      const start = m.index;

      const boundary = usesBoundaryCapture ? (m[1] || "") : "";
      const wordPart = usesBoundaryCapture ? full.slice(boundary.length) : full;

      const wordStart = start + boundary.length;
      const wordEnd = start + full.length;

      // 忽略空
      if (wordPart.trim() === "") continue;

      const dictKey = findRootInVocab(wordPart.toLowerCase());
      if (!dictKey || masteredWords.has(dictKey)) continue;

      matches.push({ dictKey, wordStart, wordEnd });
    }

    if (matches.length === 0) return;

    for (let i = matches.length - 1; i >= 0; i--) {
      const it = matches[i];

      const s = locateByIndex(nodes, prefix, it.wordStart);
      const e = locateByIndex(nodes, prefix, it.wordEnd);
      if (!s || !e) continue;

      // 如果已经在高亮里就跳过
      if (
        s.node.parentNode &&
        s.node.parentNode.closest &&
        s.node.parentNode.closest(".tech-word-highlight")
      )
        continue;
      if (
        e.node.parentNode &&
        e.node.parentNode.closest &&
        e.node.parentNode.closest(".tech-word-highlight")
      )
        continue;

      try {
        const r = document.createRange();
        r.setStart(s.node, s.offset);
        r.setEnd(e.node, e.offset);

        // 二次确认：Range 文本必须包含字母
        const txt = r.toString();
        if (!/[A-Za-z]/.test(txt)) continue;

        const span = document.createElement("span");
        span.className = "tech-word-highlight";
        span.dataset.key = it.dictKey;

        // extract + wrap：保留 <i>/<code> 等原格式
        const frag = r.extractContents();
        span.appendChild(frag);
        r.insertNode(span);

        r.detach();
      } catch (_) {
        // Range 在复杂 DOM 上可能失败：忽略即可（单节点 pass 仍会覆盖大部分）
      }
    }
  }

  function highlightDocument() {
    if (!compiled) return;

    // pass1: 单节点快扫
    highlightWithinTextNodes(document.body);

    // pass2: 跨节点扫（斜体/代码拆分）
    const blocks = document.querySelectorAll(BLOCK_SELECTOR);
    for (const b of blocks) {
      // 跳过可编辑
      if (b.isContentEditable) continue;
      if (b.closest && b.closest("#neural-tooltip-container")) continue;
      highlightAcrossNodesInBlock(b);
    }
  }

  function scheduleRescan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      compileMatchers();
      highlightDocument();
    }, 400);
  }

  // --- Observe DOM changes (SPA / infinite scroll) ---
  function observeChanges() {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          scheduleRescan();
          break;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- Storage sync ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.mastered_list) {
      masteredWords = new Set(changes.mastered_list.newValue || []);
      scheduleRescan();
    }

    if (changes.custom_vocab) {
      const nextCustom = changes.custom_vocab.newValue || {};
      fetch(vocabUrl)
        .then((r) => r.json())
        .then((baseVocab) => {
          vocabulary = { ...baseVocab, ...nextCustom };
          scheduleRescan();
        })
        .catch(() => {});
    }
  });

  // --- Context menu add word message ---
  chrome.runtime.onMessage.addListener((req) => {
    if (req && req.action === "prompt_for_definition") {
      const key = normalizeWord(req.word);
      if (!key) return;

      const def = prompt(`添加生词:\n"${key}"\n\n请输入中文释义:`, "自定义笔记");
      if (!def || def.trim() === "") return;

      vocabulary[key] = def;

      chrome.storage.local.get(["custom_vocab"], (res) => {
        const custom = res.custom_vocab || {};
        custom[key] = def;

        chrome.storage.local.set({ custom_vocab: custom }, () => {
          // 如果之前掌握过，撤销掌握
          if (masteredWords.has(key)) {
            masteredWords.delete(key);
            chrome.storage.local.set({ mastered_list: Array.from(masteredWords) });
          }
          scheduleRescan();
        });
      });
    }
  });

  // --- Init ---
  Promise.all([
    chrome.storage.local.get(["mastered_list", "custom_vocab"]),
    fetch(vocabUrl).then((r) => r.json()),
  ])
    .then(([st, baseVocab]) => {
      masteredWords = new Set(st.mastered_list || []);
      const custom = st.custom_vocab || {};
      vocabulary = { ...baseVocab, ...custom };

      compileMatchers();
      highlightDocument();
      observeChanges();
    })
    .catch(() => {});
})();
