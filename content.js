// ============================================
// TechWordLearn - Content Script (Full Replace)
// ============================================

(() => {
  // 防止重复注入导致重复绑定事件（版本化标记，允许从旧脚本平滑升级）
  const CONTENT_BOOTSTRAP_VERSION = 2;
  if (window.__techwordlearn_loaded__ === CONTENT_BOOTSTRAP_VERSION) return;
  window.__techwordlearn_loaded__ = CONTENT_BOOTSTRAP_VERSION;
  console.log("[TechWordLearn] content.js active v1.5");

  let vocabulary = {};
  let baseVocab = {};
  let customVocab = {};
  let deletedWords = new Set();
  let masteredWords = new Set();

  const vocabUrl = (() => {
    try {
      return chrome.runtime.getURL("vocabulary.json");
    } catch (_) {
      return null;
    }
  })();
  const SUFFIXES = ["ing", "ed", "es", "s", "d", "ly"];
  const MAX_VOCAB_BACKUPS = 20;

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
  let warnedInvalidContext = false;

  // --- Stable TTS (fix low/hoarse voice on macOS/Chrome) ---
  let __tts_inited = false;
  let __tts_voice = null;
  let __tts_lastSpeakAt = 0;
  let __tts_requestSeq = 0;

  function isContextInvalidated(errOrMsg) {
    const msg =
      typeof errOrMsg === "string"
        ? errOrMsg
        : errOrMsg && errOrMsg.message
        ? errOrMsg.message
        : "";
    return /extension context invalidated/i.test(String(msg));
  }

  function hasExtensionContext() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function warnInvalidContextOnce() {
    if (warnedInvalidContext) return;
    warnedInvalidContext = true;
    // 允许新版本脚本在同页重新注入并接管
    window.__techwordlearn_loaded__ = 0;
    console.warn(
      "[TechWordLearn] Extension context invalidated. Refresh this page to reattach extension APIs."
    );
  }

  function safeChromeCall(onFailure, fn) {
    if (!hasExtensionContext()) {
      warnInvalidContextOnce();
      if (onFailure) onFailure();
      return;
    }
    try {
      fn();
    } catch (err) {
      if (isContextInvalidated(err)) warnInvalidContextOnce();
      else console.warn("[TechWordLearn] Chrome API call failed:", err);
      if (onFailure) onFailure();
    }
  }

  function safeStorageGet(keys, callback) {
    safeChromeCall(
      () => callback({}),
      () => {
        chrome.storage.local.get(keys, (result) => {
          if (!hasExtensionContext()) {
            warnInvalidContextOnce();
            callback({});
            return;
          }

          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            if (isContextInvalidated(lastErr)) warnInvalidContextOnce();
            callback({});
            return;
          }
          callback(result || {});
        });
      }
    );
  }

  function safeStorageSet(payload, callback) {
    safeChromeCall(
      () => {
        if (callback) callback();
      },
      () => {
        chrome.storage.local.set(payload, () => {
          if (!hasExtensionContext()) {
            warnInvalidContextOnce();
            if (callback) callback();
            return;
          }

          const lastErr = chrome.runtime.lastError;
          if (lastErr && isContextInvalidated(lastErr)) warnInvalidContextOnce();
          if (callback) callback();
        });
      }
    );
  }

  function safeStorageGetPromise(keys) {
    return new Promise((resolve) => {
      safeStorageGet(keys, resolve);
    });
  }

  function safeAddStorageOnChangedListener(listener) {
    safeChromeCall(null, () => {
      chrome.storage.onChanged.addListener(listener);
    });
  }

  function safeAddRuntimeOnMessageListener(listener) {
    safeChromeCall(null, () => {
      chrome.runtime.onMessage.addListener(listener);
    });
  }

  function safeRuntimeSendMessage(payload, callback) {
    safeChromeCall(
      () => {
        if (callback) callback(null);
      },
      () => {
        chrome.runtime.sendMessage(payload, (res) => {
          if (!hasExtensionContext()) {
            warnInvalidContextOnce();
            if (callback) callback(null);
            return;
          }
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            if (isContextInvalidated(lastErr)) warnInvalidContextOnce();
            if (callback) callback(null);
            return;
          }
          if (callback) callback(res || null);
        });
      }
    );
  }

  function loadBaseVocabulary() {
    if (!vocabUrl) return Promise.resolve({});
    return fetch(vocabUrl)
      .then((r) => r.json())
      .then((json) => sanitizeWordMap(json))
      .catch(() => ({}));
  }

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

  function sanitizeWordMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof key !== "string" || typeof value !== "string") continue;
      const normalized = normalizeWord(key);
      const def = value.trim();
      if (!normalized || !def) continue;
      out[normalized] = def;
    }
    return out;
  }

  function sanitizeWordList(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      const normalized = normalizeWord(item);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function sanitizeWordCountMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const normalized = normalizeWord(key);
      if (!normalized || normalized !== key) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      out[key] = Math.floor(value);
    }
    return out;
  }

  function getCurrentWeekKey() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  function sanitizeWeeklyWordCounts(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [weekKey, value] of Object.entries(raw)) {
      if (!/^\d{4}-W\d{2}$/.test(weekKey)) continue;
      out[weekKey] = sanitizeWordCountMap(value);
    }
    return out;
  }

  function pruneWeeklyWordCounts(weeklyMap, keep) {
    const keys = Object.keys(weeklyMap).sort((a, b) => b.localeCompare(a));
    const next = {};
    for (let i = 0; i < keys.length && i < keep; i++) {
      next[keys[i]] = weeklyMap[keys[i]];
    }
    return next;
  }

  function makeSnapshotId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function rebuildVocabulary() {
    const merged = { ...baseVocab, ...customVocab };
    deletedWords.forEach((word) => {
      delete merged[word];
    });
    vocabulary = merged;
  }

  function saveVocabularyState(nextCustom, nextDeleted, reason, callback) {
    safeStorageGet(["custom_vocab", "deleted_vocab", "vocab_backups"], (res) => {
      const currentCustom = sanitizeWordMap(res.custom_vocab);
      const currentDeleted = sanitizeWordList(res.deleted_vocab);
      const currentBackups = Array.isArray(res.vocab_backups) ? res.vocab_backups : [];

      const snapshot = {
        id: makeSnapshotId(),
        at: new Date().toISOString(),
        label: reason || "manual",
        custom_vocab: currentCustom,
        deleted_vocab: currentDeleted,
      };

      const cleanCustom = sanitizeWordMap(nextCustom);
      const cleanDeleted = sanitizeWordList(Array.from(nextDeleted || []));
      for (const word of Object.keys(cleanCustom)) {
        const idx = cleanDeleted.indexOf(word);
        if (idx >= 0) cleanDeleted.splice(idx, 1);
      }

      const backups = [snapshot, ...currentBackups].slice(0, MAX_VOCAB_BACKUPS);

      safeStorageSet(
        {
          custom_vocab: cleanCustom,
          deleted_vocab: cleanDeleted,
          vocab_backups: backups,
          current_vocab_version_id: null,
          current_vocab_mode: "live",
        },
        () => {
          customVocab = cleanCustom;
          deletedWords = new Set(cleanDeleted);
          rebuildVocabulary();
          if (callback) callback();
        }
      );
    });
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

    safeStorageGet([key], (res) => {
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
    safeStorageGet([word, "weekly_word_counts"], (result) => {
      const newCount = (result[word] || 0) + 1;
      const weekly = sanitizeWeeklyWordCounts(result.weekly_word_counts);
      const weekKey = getCurrentWeekKey();
      const oneWeek = sanitizeWordCountMap(weekly[weekKey]);
      oneWeek[word] = (oneWeek[word] || 0) + 1;
      weekly[weekKey] = oneWeek;
      const prunedWeekly = pruneWeeklyWordCounts(weekly, 12);

      safeStorageSet({ [word]: newCount, weekly_word_counts: prunedWeekly });
    });
  }

  function speakViaWebSpeech(text) {
    return new Promise((resolve) => {
      try {
        __tts_initOnce();
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();

        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 1.0;
        u.pitch = 1.12; // 想更亮：1.15~1.2；想更自然：1.0
        u.volume = 1.0;
        if (__tts_voice) u.voice = __tts_voice;

        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          resolve(Boolean(ok));
        };

        u.onstart = () => finish(true);
        u.onerror = () => finish(false);

        window.speechSynthesis.speak(u);

        // 某些页面会吞掉 speak；超时后用状态兜底判断
        setTimeout(() => {
          finish(window.speechSynthesis.speaking || window.speechSynthesis.pending);
        }, 300);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function speakViaChromeTts(text) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(Boolean(ok));
      };

      safeRuntimeSendMessage({ action: "speak_word", text }, (res) => {
        if (!res || !res.ok) {
          const reason = (res && res.error) || "runtime_failed";
          console.warn(`[TWL_TTS] chrome fail reason=${reason}`);
          finish(false);
          return;
        }
        console.log(`[TWL_TTS] chrome ok event=${res.eventType || "unknown"}`);
        finish(true);
      });

      // 防止 runtime 消息异常时卡住，给 web speech 回退机会
      setTimeout(() => finish(false), 1200);
    });
  }

  function speakText(text) {
    const phrase = String(text || "").trim();
    if (!phrase) return;

    const now = Date.now();
    // 防止极少数情况下同一次点击触发多次 speak，听起来会“糊/沙哑”
    if (now - __tts_lastSpeakAt < 180) return;
    __tts_lastSpeakAt = now;
    const reqId = ++__tts_requestSeq;

    // 一旦检测过 context invalidated，就强制走本地 Web Speech，避免 runtime_failed 后静音
    if (warnedInvalidContext || !hasExtensionContext()) {
      speakViaWebSpeech(phrase);
      return;
    }

    // 优先走 chrome.tts；失败再回退 web speech
    speakViaChromeTts(phrase).then((ok) => {
      // 有更新的点击请求时，忽略旧请求结果
      if (reqId !== __tts_requestSeq) return;
      if (!ok) {
        speakViaWebSpeech(phrase).then((webOk) => {
          if (reqId !== __tts_requestSeq) return;
          if (!webOk) console.warn("[TechWordLearn] Both chrome.tts and Web Speech failed.");
        });
      }
    });
  }

  function markAsMastered(word) {
    if (!confirm(`标记为已掌握：${word}?`)) return;

    masteredWords.add(word);
    safeStorageSet({ mastered_list: Array.from(masteredWords) });

    // 重要：保留原格式（斜体/代码），不要直接替换成纯文本
    const spans = document.querySelectorAll(
      `.tech-word-highlight[data-key="${CSS.escape(word)}"]`
    );
    spans.forEach(unwrapSpanKeepChildren);

    hideTooltip();
    hoverSeq++;
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
  safeAddStorageOnChangedListener((changes, area) => {
    if (area !== "local") return;
    let shouldRescan = false;

    if (changes.mastered_list) {
      masteredWords = new Set(changes.mastered_list.newValue || []);
      shouldRescan = true;
    }

    if (changes.custom_vocab) {
      customVocab = sanitizeWordMap(changes.custom_vocab.newValue || {});
      shouldRescan = true;
    }

    if (changes.deleted_vocab) {
      deletedWords = new Set(sanitizeWordList(changes.deleted_vocab.newValue || []));
      shouldRescan = true;
    }

    if (shouldRescan) {
      rebuildVocabulary();
      scheduleRescan();
    }
  });

  // --- Context menu add word message ---
  safeAddRuntimeOnMessageListener((req) => {
    if (req && req.action === "prompt_for_definition") {
      const key = normalizeWord(req.word);
      if (!key) return;

      const def = prompt(`添加生词:\n"${key}"\n\n请输入中文释义:`, "自定义笔记");
      const cleanDef = def ? def.trim() : "";
      if (!cleanDef) return;

      const nextCustom = { ...customVocab, [key]: cleanDef };
      const nextDeleted = new Set(deletedWords);
      nextDeleted.delete(key);

      saveVocabularyState(nextCustom, nextDeleted, `context_add:${key}`, () => {
        // 如果之前掌握过，撤销掌握
        if (masteredWords.has(key)) {
          masteredWords.delete(key);
          safeStorageSet({ mastered_list: Array.from(masteredWords) });
        }
        scheduleRescan();
      });
    }
  });

  // --- Init ---
  Promise.all([safeStorageGetPromise(["mastered_list", "custom_vocab", "deleted_vocab"]), loadBaseVocabulary()])
    .then(([st, loadedBaseVocab]) => {
      baseVocab = loadedBaseVocab;
      masteredWords = new Set(st.mastered_list || []);
      customVocab = sanitizeWordMap(st.custom_vocab || {});
      deletedWords = new Set(sanitizeWordList(st.deleted_vocab || []));
      rebuildVocabulary();

      compileMatchers();
      highlightDocument();
      observeChanges();
    })
    .catch(() => {});
})();
