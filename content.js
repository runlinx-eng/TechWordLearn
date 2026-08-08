// ============================================
// TechWordLearn - Content Script (Full Replace)
// ============================================

(() => {
  // 防止重复注入导致重复绑定事件（版本化标记，允许从旧脚本平滑升级）
  const CONTENT_BOOTSTRAP_VERSION = 4;
  if (window.__techwordlearn_loaded__ === CONTENT_BOOTSTRAP_VERSION) return;
  window.__techwordlearn_loaded__ = CONTENT_BOOTSTRAP_VERSION;
  console.log("[TechWordLearn] content.js active v1.14");

  const EXTENSION_ENABLED_KEY = "extension_enabled";
  let extensionEnabled = false;
  let extensionStateInitialized = false;
  let extensionStateChangedDuringInit = false;
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
  let tooltipEl = null;

  let compiled = null; // { testRegex, replaceRegex, usesBoundaryCapture }
  let scanTimer = null;
  let observedRoots = new WeakSet();
  const rootObservers = [];
  let observerBootstrapTimers = [];
  let rootMutationHandler = null;

  let hoverSeq = 0; // 防止异步 storage 回调串台
  let warnedInvalidContext = false;

  // --- Stable TTS (fix low/hoarse voice on macOS/Chrome) ---
  let __tts_inited = false;
  let __tts_voice = null;
  let __tts_lastSpeakAt = 0;
  let __tts_requestSeq = 0;

  function ensureTooltipEl() {
    if (!extensionEnabled) return null;
    if (tooltipEl && tooltipEl.isConnected) return tooltipEl;

    tooltipEl = document.getElementById("neural-tooltip-container");
    if (tooltipEl) return tooltipEl;

    tooltipEl = document.createElement("div");
    tooltipEl.id = "neural-tooltip-container";
    const mountTarget = document.body || document.documentElement;
    if (mountTarget) mountTarget.appendChild(tooltipEl);
    return tooltipEl;
  }

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

  function collectScanRoots() {
    const roots = [];
    const seen = new Set();

    const addRoot = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    };

    if (!document.body) return roots;
    addRoot(document.body);

    const stack = [document.body];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || !node.children) continue;

      if (node.shadowRoot) {
        addRoot(node.shadowRoot);
        const shadowChildren = node.shadowRoot.children;
        for (let i = shadowChildren.length - 1; i >= 0; i--) {
          stack.push(shadowChildren[i]);
        }
      }

      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    return roots;
  }

  function containsOpenShadowRoot(node) {
    if (!node) return false;
    if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) return true;
    if (!node.querySelectorAll) return false;

    const descendants = node.querySelectorAll("*");
    for (const el of descendants) {
      if (el.shadowRoot) return true;
    }
    return false;
  }

  function isExtensionOwnedMutationNode(node) {
    if (!node) return false;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement || (node.parentNode && node.parentNode.host) || null;
    if (!element) return false;
    if (element.id === "neural-tooltip-container") return true;
    if (element.classList && element.classList.contains("tech-word-highlight")) return true;
    return Boolean(
      element.closest &&
        element.closest("#neural-tooltip-container, .tech-word-highlight")
    );
  }

  function ensureRootObservers() {
    if (!extensionEnabled || !rootMutationHandler) return;
    const roots = collectScanRoots();
    for (const root of roots) {
      if (!root || observedRoots.has(root)) continue;
      const obs = new MutationObserver(rootMutationHandler);
      obs.observe(root, { childList: true, subtree: true, characterData: true });
      observedRoots.add(root);
      rootObservers.push(obs);
    }
  }

  function stopObservingChanges() {
    for (const observer of rootObservers) {
      observer.disconnect();
    }
    rootObservers.length = 0;
    observedRoots = new WeakSet();

    for (const timer of observerBootstrapTimers) {
      clearTimeout(timer);
    }
    observerBootstrapTimers = [];
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
    safeStorageGet(["custom_vocab", "deleted_vocab", "mastered_list", "vocab_backups"], (res) => {
      const currentCustom = sanitizeWordMap(res.custom_vocab);
      const currentDeleted = sanitizeWordList(res.deleted_vocab);
      const currentMastered = sanitizeWordList(res.mastered_list);
      const currentBackups = Array.isArray(res.vocab_backups) ? res.vocab_backups : [];

      const snapshot = {
        id: makeSnapshotId(),
        at: new Date().toISOString(),
        label: reason || "manual",
        custom_vocab: currentCustom,
        deleted_vocab: currentDeleted,
        mastered_list: currentMastered,
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
          vocab_sync_updated_at: new Date().toISOString(),
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

  function removeInactiveHighlights(onlyWords) {
    const parents = new Set();
    for (const root of collectScanRoots()) {
      if (!root.querySelectorAll) continue;
      for (const span of root.querySelectorAll(".tech-word-highlight")) {
        const key = normalizeWord(span.dataset && span.dataset.key);
        const targeted = !onlyWords || (key && onlyWords.has(key));
        const inactive = !key || !vocabulary[key] || masteredWords.has(key);
        if (!targeted || (!onlyWords && !inactive)) continue;
        if (span.parentNode) parents.add(span.parentNode);
        unwrapSpanKeepChildren(span);
      }
    }

    for (const parent of parents) {
      if (parent && parent.isConnected && typeof parent.normalize === "function") {
        parent.normalize();
      }
    }
  }

  function hideTooltip() {
    const tip =
      (tooltipEl && tooltipEl.isConnected && tooltipEl) ||
      document.getElementById("neural-tooltip-container");
    if (tip) tip.classList.remove("active");
  }

  function removePageEffects() {
    const highlights = new Set();
    for (const root of collectScanRoots()) {
      if (!root.querySelectorAll) continue;
      for (const span of root.querySelectorAll(".tech-word-highlight")) {
        highlights.add(span);
      }
    }

    const parents = new Set();
    for (const span of highlights) {
      if (span.parentNode) parents.add(span.parentNode);
      unwrapSpanKeepChildren(span);
    }
    for (const parent of parents) {
      if (parent && parent.isConnected && typeof parent.normalize === "function") {
        parent.normalize();
      }
    }

    hideTooltip();
    const tip =
      (tooltipEl && tooltipEl.isConnected && tooltipEl) ||
      document.getElementById("neural-tooltip-container");
    if (tip) tip.remove();
    tooltipEl = null;
  }

  function applyExtensionEnabledState(enabled) {
    const nextEnabled = Boolean(enabled);
    if (extensionStateInitialized && nextEnabled === extensionEnabled) return;

    extensionStateInitialized = true;
    extensionEnabled = nextEnabled;
    hoverSeq++;

    if (!extensionEnabled) {
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      stopObservingChanges();
      compiled = null;
      removePageEffects();
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
      return;
    }

    ensureTooltipEl();
    compileMatchers();
    highlightDocument();
    observeChanges();
  }

  function findHighlightFromNode(node) {
    if (!node || node === document || node === window) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList && node.classList.contains("tech-word-highlight")) return node;
      if (typeof node.closest === "function") return node.closest(".tech-word-highlight");
    }
    return null;
  }

  function findHighlightFromEvent(e) {
    const direct = findHighlightFromNode(e && e.target);
    if (direct) return direct;

    if (!e || typeof e.composedPath !== "function") return null;
    const path = e.composedPath();
    for (const node of path) {
      const hit = findHighlightFromNode(node);
      if (hit) return hit;
    }
    return null;
  }

  // --- Hover + Click delegation (works even if highlight wraps <i>/<code> etc) ---
  function onMouseOver(e) {
    if (!extensionEnabled) return;
    const span = findHighlightFromEvent(e);
    if (!span) return;

    const key = span.dataset.key;
    if (!key || !vocabulary[key]) return;

    const def = vocabulary[key];
    const my = ++hoverSeq;

    safeStorageGet([key], (res) => {
      if (my !== hoverSeq) return;

      const count = res[key] || 0;
      const tip = ensureTooltipEl();
      if (!tip) return;
      tip.innerText = `${def}\n点读过 ${count} 次`;

      const r = span.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 260))}px`;
      tip.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 60)}px`;
      tip.classList.add("active");
    });
  }

  function onMouseOut(e) {
    if (!extensionEnabled) return;
    // 只在“离开高亮 span 本体”时隐藏，避免 document 级 mouseout 冒泡误伤
    const fromSpan = findHighlightFromEvent(e);
    if (!fromSpan) return;

    const toSpan = findHighlightFromNode(e.relatedTarget);

    // 从一个高亮移到另一个高亮：不隐藏（mouseover 会更新 tooltip）
    if (toSpan) return;

    hideTooltip();
  }

  function onClick(e) {
    if (!extensionEnabled) return;
    const span = findHighlightFromEvent(e);
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
    safeRuntimeSendMessage({ action: "increment_word_count", word }, (response) => {
      if (!response || !response.ok) {
        console.warn(
          `[TechWordLearn] Count update failed: ${(response && response.error) || "runtime_failed"}`
        );
      }
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
    safeStorageSet({
      mastered_list: Array.from(masteredWords),
      current_vocab_version_id: null,
      current_vocab_mode: "live",
      vocab_sync_updated_at: new Date().toISOString(),
    });

    // 同时覆盖普通 DOM 与开放 Shadow DOM，并保留原格式。
    removeInactiveHighlights(new Set([word]));

    hideTooltip();
    hoverSeq++;
    compileMatchers();
  }

  // --- Highlight pass 1: single text node replace (fast) ---
  function highlightWithinTextNodes(root) {
    if (!extensionEnabled || !compiled) return;

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
    if (!extensionEnabled || !compiled) return;

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
    if (!extensionEnabled || !compiled || !document.body) return;

    const roots = collectScanRoots();
    for (const root of roots) {
      // pass1: 单节点快扫
      highlightWithinTextNodes(root);
    }

    for (const root of roots) {
      if (!root.querySelectorAll) continue;
      // pass2: 跨节点扫（斜体/代码拆分）
      const blocks = root.querySelectorAll(BLOCK_SELECTOR);
      for (const b of blocks) {
        // 跳过可编辑
        if (b.isContentEditable) continue;
        if (b.closest && b.closest("#neural-tooltip-container")) continue;
        highlightAcrossNodesInBlock(b);
      }
    }
  }

  function scheduleRescan() {
    if (!extensionEnabled) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (!extensionEnabled) return;
      ensureRootObservers();
      compileMatchers();
      highlightDocument();
    }, 400);
  }

  // --- Observe DOM changes (SPA / infinite scroll) ---
  function observeChanges() {
    if (!extensionEnabled) return;
    if (!rootMutationHandler) {
      rootMutationHandler = (mutations) => {
        if (!extensionEnabled) return;
        let shouldRescan = false;
        let shouldRefreshRoots = false;
        for (const m of mutations) {
          if (m.type === "characterData") {
            if (isExtensionOwnedMutationNode(m.target)) continue;
            shouldRescan = true;
            continue;
          }
          if (m.addedNodes && m.addedNodes.length > 0) {
            for (const added of m.addedNodes) {
              if (isExtensionOwnedMutationNode(added)) continue;
              shouldRescan = true;
              if (containsOpenShadowRoot(added)) {
                shouldRefreshRoots = true;
                break;
              }
            }
            if (shouldRefreshRoots) break;
          }
        }
        if (shouldRefreshRoots) ensureRootObservers();
        if (shouldRescan) scheduleRescan();
      };
    }

    ensureRootObservers();

    // 某些 SPA 会延迟挂载/替换根节点，补三次启动兜底
    observerBootstrapTimers = [700, 1800, 4000].map((ms) =>
      setTimeout(() => {
        if (!extensionEnabled) return;
        ensureRootObservers();
        scheduleRescan();
      }, ms)
    );
  }

  // --- Storage sync ---
  safeAddStorageOnChangedListener((changes, area) => {
    if (area !== "local") return;
    let shouldRescan = false;
    const enabledChanged = Object.prototype.hasOwnProperty.call(changes, EXTENSION_ENABLED_KEY);
    const nextEnabled = enabledChanged
      ? changes[EXTENSION_ENABLED_KEY].newValue !== false
      : extensionEnabled;
    if (enabledChanged) extensionStateChangedDuringInit = true;

    if (changes.mastered_list) {
      masteredWords = new Set(sanitizeWordList(changes.mastered_list.newValue || []));
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
      removeInactiveHighlights();
    }

    if (enabledChanged) {
      applyExtensionEnabledState(nextEnabled);
    } else if (shouldRescan && extensionEnabled) {
      scheduleRescan();
    }
  });

  // --- Context menu add word message ---
  safeAddRuntimeOnMessageListener((req, _sender, sendResponse) => {
    if (req && req.action === "twl_ping") {
      sendResponse({
        ok: true,
        version: "1.14",
        enabled: extensionEnabled,
        vocabSize: Object.keys(vocabulary || {}).length,
      });
      return;
    }

    if (req && req.action === "prompt_for_definition") {
      if (!extensionEnabled) {
        sendResponse({ ok: false, error: "extension_disabled" });
        return;
      }
      const key = normalizeWord(req.word);
      if (!key) return;

      const def = prompt(`把 "${key}" 加入我的词库\n\n请输入中文意思:`, "我的笔记");
      const cleanDef = def ? def.trim() : "";
      if (!cleanDef) return;

      const nextCustom = { ...customVocab, [key]: cleanDef };
      const nextDeleted = new Set(deletedWords);
      nextDeleted.delete(key);

      saveVocabularyState(nextCustom, nextDeleted, `context_add:${key}`, () => {
        // 如果之前掌握过，撤销掌握
        if (masteredWords.has(key)) {
          masteredWords.delete(key);
          safeStorageSet({
            mastered_list: Array.from(masteredWords),
            vocab_sync_updated_at: new Date().toISOString(),
          });
        }
        scheduleRescan();
      });
    }
  });

  // --- Init ---
  Promise.all([
    safeStorageGetPromise([
      "mastered_list",
      "custom_vocab",
      "deleted_vocab",
      EXTENSION_ENABLED_KEY,
    ]),
    loadBaseVocabulary(),
  ])
    .then(([st, loadedBaseVocab]) => {
      baseVocab = loadedBaseVocab;
      masteredWords = new Set(sanitizeWordList(st.mastered_list || []));
      customVocab = sanitizeWordMap(st.custom_vocab || {});
      deletedWords = new Set(sanitizeWordList(st.deleted_vocab || []));
      rebuildVocabulary();
      applyExtensionEnabledState(
        extensionStateChangedDuringInit ? extensionEnabled : st[EXTENSION_ENABLED_KEY] !== false
      );
    })
    .catch(() => {});
})();
