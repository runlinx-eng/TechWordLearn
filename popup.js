const EXTENSION_ENABLED_KEY = "extension_enabled";
let baseVocab = {};

function normalizeWord(raw) {
  const text = String(raw || "").trim().toLowerCase();
  return /^[a-z][a-z'-]*$/.test(text) ? text : null;
}

function sanitizeWordMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const word = normalizeWord(key);
    if (!word || typeof value !== "string" || !value.trim()) continue;
    out[word] = value.trim();
  }
  return out;
}

function sanitizeWordSet(raw) {
  const out = new Set();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const word = normalizeWord(item);
    if (word) out.add(word);
  }
  return out;
}

function buildActiveWordSet(items) {
  const merged = { ...baseVocab, ...sanitizeWordMap(items && items.custom_vocab) };
  for (const word of sanitizeWordSet(items && items.deleted_vocab)) {
    delete merged[word];
  }
  return new Set(Object.keys(merged));
}

function loadBaseVocabulary() {
  return fetch(chrome.runtime.getURL("vocabulary.json"))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((json) => {
      baseVocab = sanitizeWordMap(json);
    })
    .catch(() => {
      baseVocab = {};
    });
}

function isExtensionEnabled(value) {
  return value !== false;
}

function paintGlobalState(enabled, helpText) {
  const control = document.getElementById("global-control");
  const input = document.getElementById("global-enabled");
  const label = document.getElementById("global-state-label");
  const help = document.getElementById("global-state-help");
  if (!control || !input || !label || !help) return;

  control.dataset.enabled = String(enabled);
  input.checked = enabled;
  label.textContent = enabled ? "TechWordLearn 已启用" : "TechWordLearn 已停用";
  help.textContent =
    helpText ||
    (enabled
      ? "支持网页中的标记和点读已开启。"
      : "网页标记和点读已暂停。");
}

function loadGlobalState(callback) {
  const input = document.getElementById("global-enabled");
  chrome.storage.local.get([EXTENSION_ENABLED_KEY], (items) => {
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      paintGlobalState(true, `读取状态失败：${lastErr.message}`);
      if (input) input.disabled = true;
      if (callback) callback(true);
      return;
    }

    const enabled = isExtensionEnabled(items[EXTENSION_ENABLED_KEY]);
    paintGlobalState(enabled);
    if (input) input.disabled = false;
    if (callback) callback(enabled);
  });
}

function saveGlobalState(enabled) {
  const input = document.getElementById("global-enabled");
  if (input) input.disabled = true;
  paintGlobalState(enabled, enabled ? "正在启用…" : "正在停用…");

  chrome.storage.local.set({ [EXTENSION_ENABLED_KEY]: enabled }, () => {
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      const restored = !enabled;
      paintGlobalState(restored, `保存状态失败：${lastErr.message}`);
      if (input) input.disabled = false;
      return;
    }

    paintGlobalState(enabled);
    if (input) input.disabled = false;
    renderDiagnosis();
  });
}

function renderStats() {
  chrome.storage.local.get(null, (items) => {
    const listDiv = document.getElementById("stats-list");
    const metaDiv = document.getElementById("meta");
    const lastErr = chrome.runtime.lastError;

    if (lastErr) {
      listDiv.innerHTML = `<p class="empty">${lastErr.message}</p>`;
      metaDiv.textContent = "读取记录失败。";
      return;
    }

    const weekKey = getCurrentWeekKey();
    const activeWords = buildActiveWordSet(items);
    const weeklyMap = sanitizeCountMap(items.weekly_word_counts && items.weekly_word_counts[weekKey]);
    let sortedWords = rankWordCounts(weeklyMap, items.mastered_list, activeWords).slice(0, 50);
    let modeLabel = `本周 ${weekKey}`;

    if (sortedWords.length === 0) {
      sortedWords = rankWordCounts(items, items.mastered_list, activeWords).slice(0, 50);
      modeLabel = "累计记录（本周暂无）";
    }

    const customCount = Object.keys(items.custom_vocab || {}).length;
    const deletedCount = Array.isArray(items.deleted_vocab) ? items.deleted_vocab.length : 0;
    const backupCount = Array.isArray(items.vocab_backups) ? items.vocab_backups.length : 0;
    metaDiv.textContent =
      `${modeLabel} | 自己添加或修改 ${customCount} | 已隐藏 ${deletedCount} | 历史版本 ${backupCount}`;

    if (sortedWords.length === 0) {
      listDiv.innerHTML = '<p class="empty">先在网页里点读几个高亮词。</p>';
      return;
    }

    let html = "<ul>";
    for (const [word, count] of sortedWords) {
      html += `
        <li>
          <span class="word">${word}</span>
          <span class="count">点读 ${count} 次</span>
        </li>
      `;
    }
    html += "</ul>";
    listDiv.innerHTML = html;
  });
}

function isInjectableUrl(url) {
  return /^(https?:\/\/|file:\/\/)/i.test(String(url || ""));
}

function renderDiagnosis() {
  const diagDiv = document.getElementById("diag");
  if (!diagDiv) return;

  chrome.storage.local.get([EXTENSION_ENABLED_KEY], (items) => {
    const stateErr = chrome.runtime.lastError;
    if (stateErr) {
      diagDiv.textContent = `无法读取插件状态：${stateErr.message}`;
      return;
    }

    if (!isExtensionEnabled(items[EXTENSION_ENABLED_KEY])) {
      diagDiv.textContent = "当前网页：插件已停用";
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        diagDiv.textContent = "当前没有可检查的网页";
        return;
      }

      const url = String(tab.url || "");
      if (!isInjectableUrl(url)) {
        diagDiv.textContent = "当前网页不支持扩展运行";
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "twl_ping" }, (res) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          diagDiv.textContent = "当前网页尚未连接扩展，请刷新后重试";
          return;
        }

        if (res && res.enabled === false) {
          diagDiv.textContent = "当前网页：点读已暂停";
          return;
        }

        const vocabCount = typeof (res && res.vocabSize) === "number" ? res.vocabSize : "n/a";
        diagDiv.textContent = `当前网页：已启用 · ${vocabCount} 个词`;
      });
    });
  });
}

function sanitizeCountMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const word = normalizeWord(k);
    if (!word || word !== k) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
    out[word] = Math.floor(v);
  }
  return out;
}

function sanitizeMasteredSet(raw) {
  return sanitizeWordSet(raw);
}

function rankWordCounts(raw, masteredList, activeWords) {
  const mastered = sanitizeMasteredSet(masteredList);
  return Object.entries(sanitizeCountMap(raw))
    .filter(([word]) => !mastered.has(word) && (!activeWords || activeWords.has(word)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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

function openManager() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("open-vocab-manager").addEventListener("click", openManager);
  document.getElementById("global-enabled").addEventListener("change", (event) => {
    saveGlobalState(Boolean(event.target.checked));
  });
  document.getElementById("refresh-stats").addEventListener("click", () => {
    renderStats();
    renderDiagnosis();
  });
  loadBaseVocabulary().finally(() => {
    loadGlobalState(() => {
      renderDiagnosis();
      renderStats();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[EXTENSION_ENABLED_KEY]) {
      paintGlobalState(isExtensionEnabled(changes[EXTENSION_ENABLED_KEY].newValue));
    }
    const hasCountChange = Object.entries(changes).some(([key, diff]) => {
      if (normalizeWord(key) !== key) return false;
      return [diff.oldValue, diff.newValue].some(
        (value) => typeof value === "number" && Number.isFinite(value)
      );
    });
    if (
      changes.mastered_list ||
      changes.custom_vocab ||
      changes.deleted_vocab ||
      changes.weekly_word_counts ||
      hasCountChange
    ) {
      renderStats();
    }
  });
});
