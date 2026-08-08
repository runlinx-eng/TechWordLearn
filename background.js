console.log("[TechWordLearn] background.js active v1.14");

const VOCAB_SYNC_KEYS = ["custom_vocab", "deleted_vocab", "mastered_list"];
const VOCAB_SYNC_STAMP_KEY = "vocab_sync_updated_at";
const VOCAB_SYNC_ALL_KEYS = [...VOCAB_SYNC_KEYS, VOCAB_SYNC_STAMP_KEY];
const EXTENSION_ENABLED_KEY = "extension_enabled";
const INJECT_DIAG_KEY = "__twl_inject_diag";
const CLOUD_SYNC_ENABLED_KEY = "cloud_sync_enabled";
const CLOUD_SYNC_ENDPOINT_KEY = "cloud_sync_endpoint";
const CLOUD_SYNC_TOKEN_KEY = "cloud_sync_token";
const CLOUD_SYNC_DEVICE_ID_KEY = "cloud_sync_device_id";
const CLOUD_SYNC_STATUS_KEY = "cloud_sync_status";
const CLOUD_SYNC_LAST_SYNCED_AT_KEY = "cloud_sync_last_synced_at";
const CLOUD_SYNC_LAST_ERROR_KEY = "cloud_sync_last_error";
const CLOUD_SYNC_LAST_REASON_KEY = "cloud_sync_last_reason";
const CLOUD_SYNC_LAST_ATTEMPT_AT_KEY = "cloud_sync_last_attempt_at";
const CLOUD_SYNC_LAST_ENDPOINT_KEY = "cloud_sync_last_endpoint";
const CLOUD_SYNC_CONFIG_KEYS = [
  CLOUD_SYNC_ENABLED_KEY,
  CLOUD_SYNC_ENDPOINT_KEY,
  CLOUD_SYNC_TOKEN_KEY,
  CLOUD_SYNC_DEVICE_ID_KEY,
];
const CLOUD_REQUEST_TIMEOUT_MS = 6000;

let cloudSyncInFlight = false;
let wordCountWriteQueue = Promise.resolve();

function normalizeWord(raw) {
  const m = String(raw || "").match(/[A-Za-z][A-Za-z'-]*/);
  return m ? m[0].toLowerCase() : null;
}

function sanitizeWordMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    const word = normalizeWord(k);
    const def = v.trim();
    if (!word || !def) continue;
    out[word] = def;
  }
  return out;
}

function sanitizeWordList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const word = normalizeWord(item);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

function sanitizeWordCountMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const word = normalizeWord(key);
    if (!word || word !== key) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    out[word] = Math.floor(value);
  }
  return out;
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

function getCurrentWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function pruneWeeklyWordCounts(weeklyMap, keep) {
  const keys = Object.keys(weeklyMap).sort((a, b) => b.localeCompare(a));
  const next = {};
  for (let index = 0; index < keys.length && index < keep; index += 1) {
    next[keys[index]] = weeklyMap[keys[index]];
  }
  return next;
}

function normalizeVocabState(raw) {
  const custom = sanitizeWordMap(raw && raw.custom_vocab);
  const deleted = sanitizeWordList(raw && raw.deleted_vocab).filter(
    (word) => !Object.prototype.hasOwnProperty.call(custom, word)
  );
  const mastered = sanitizeWordList(raw && raw.mastered_list);
  return {
    custom_vocab: custom,
    deleted_vocab: deleted.sort(),
    mastered_list: mastered.sort(),
  };
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortValue(value[key]);
  }
  return out;
}

function vocabFingerprint(raw) {
  return JSON.stringify(stableSortValue(normalizeVocabState(raw)));
}

function parseStamp(stamp) {
  if (typeof stamp !== "string") return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeStampedVocabState(raw) {
  const normalized = normalizeVocabState(raw);
  const stampRaw = raw && raw[VOCAB_SYNC_STAMP_KEY];
  const stamp = parseStamp(stampRaw) > 0 ? String(stampRaw) : new Date().toISOString();
  return {
    ...normalized,
    [VOCAB_SYNC_STAMP_KEY]: stamp,
  };
}

function mergeStatesPreferIncoming(baseState, incomingState) {
  const a = normalizeVocabState(baseState);
  const b = normalizeVocabState(incomingState);
  const mergedCustom = { ...a.custom_vocab, ...b.custom_vocab };
  const mergedDeletedSet = new Set([...a.deleted_vocab, ...b.deleted_vocab]);
  const mergedMasteredSet = new Set([...a.mastered_list, ...b.mastered_list]);
  for (const word of Object.keys(mergedCustom)) {
    mergedDeletedSet.delete(word);
  }
  return {
    custom_vocab: mergedCustom,
    deleted_vocab: Array.from(mergedDeletedSet).sort(),
    mastered_list: Array.from(mergedMasteredSet).sort(),
  };
}

function fetchWithTimeout(url, options, timeoutMs) {
  if (typeof fetch !== "function") return Promise.resolve(null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

function getStorage(areaName, keys) {
  return new Promise((resolve) => {
    const area = chrome.storage[areaName];
    if (!area) {
      resolve({});
      return;
    }
    area.get(keys, (items) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn(`[TechWordLearn] storage.${areaName}.get failed: ${err.message}`);
        resolve({});
        return;
      }
      resolve(items || {});
    });
  });
}

function setStorage(areaName, payload) {
  return new Promise((resolve, reject) => {
    const area = chrome.storage[areaName];
    if (!area) {
      resolve();
      return;
    }
    area.set(payload, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function getLocalStorageStrict(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve(items || {});
    });
  });
}

async function incrementWordCount(rawWord) {
  const input = String(rawWord || "").trim().toLowerCase();
  const word = normalizeWord(input);
  if (!word || word !== input) throw new Error("invalid_word");

  const items = await getLocalStorageStrict([word, "weekly_word_counts"]);
  const previousTotal =
    typeof items[word] === "number" && Number.isFinite(items[word]) && items[word] >= 0
      ? Math.floor(items[word])
      : 0;
  const weekly = sanitizeWeeklyWordCounts(items.weekly_word_counts);
  const weekKey = getCurrentWeekKey();
  const oneWeek = sanitizeWordCountMap(weekly[weekKey]);
  const nextTotal = previousTotal + 1;
  const nextWeekly = (oneWeek[word] || 0) + 1;
  oneWeek[word] = nextWeekly;
  weekly[weekKey] = oneWeek;

  await setStorage("local", {
    [word]: nextTotal,
    weekly_word_counts: pruneWeeklyWordCounts(weekly, 12),
  });
  return { word, total: nextTotal, weekly: nextWeekly, weekKey };
}

function enqueueWordCountIncrement(word) {
  const task = wordCountWriteQueue.then(() => incrementWordCount(word));
  wordCountWriteQueue = task.catch(() => {});
  return task;
}

function sanitizeCloudEndpoint(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function sanitizeCloudToken(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function makeDeviceId() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `twl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureCloudDeviceId(existingId) {
  const current = typeof existingId === "string" ? existingId.trim() : "";
  if (current) return current;
  const next = makeDeviceId();
  try {
    await setStorage("local", { [CLOUD_SYNC_DEVICE_ID_KEY]: next });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn(`[TechWordLearn] cloud device id save failed: ${msg}`);
  }
  return next;
}

async function getCloudSyncConfig() {
  const items = await getStorage("local", CLOUD_SYNC_CONFIG_KEYS);
  return {
    enabled: Boolean(items[CLOUD_SYNC_ENABLED_KEY]),
    endpoint: sanitizeCloudEndpoint(items[CLOUD_SYNC_ENDPOINT_KEY]),
    token: sanitizeCloudToken(items[CLOUD_SYNC_TOKEN_KEY]),
    deviceId: await ensureCloudDeviceId(items[CLOUD_SYNC_DEVICE_ID_KEY]),
  };
}

async function setCloudSyncStatus(patch) {
  if (!patch || typeof patch !== "object") return;
  try {
    await setStorage("local", patch);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn(`[TechWordLearn] cloud status save failed: ${msg}`);
  }
}

async function readFailedResponseMessage(response) {
  if (!response) return "request_failed";
  const prefix = `HTTP ${response.status}`;
  const text = await response
    .text()
    .then((value) => value.trim())
    .catch(() => "");
  if (!text) return prefix;
  const compact = text.replace(/\s+/g, " ").slice(0, 180);
  return `${prefix}: ${compact}`;
}

async function writeLocalState(vocabState, stamp) {
  await setStorage("local", {
    ...normalizeVocabState(vocabState),
    [VOCAB_SYNC_STAMP_KEY]: stamp || new Date().toISOString(),
  });
}

async function syncViaCloud(reason) {
  if (cloudSyncInFlight) return { ok: true, skipped: "busy" };

  const config = await getCloudSyncConfig();
  if (!config.enabled) {
    return { ok: true, skipped: "disabled" };
  }

  if (!config.endpoint) {
    const message = "自建服务器同步已开启，但未配置有效的同步端点";
    await setCloudSyncStatus({
      [CLOUD_SYNC_STATUS_KEY]: "error",
      [CLOUD_SYNC_LAST_ERROR_KEY]: message,
      [CLOUD_SYNC_LAST_REASON_KEY]: String(reason || "unknown"),
      [CLOUD_SYNC_LAST_ATTEMPT_AT_KEY]: new Date().toISOString(),
      [CLOUD_SYNC_LAST_ENDPOINT_KEY]: "",
    });
    return { ok: false, error: message };
  }

  cloudSyncInFlight = true;

  const attemptAt = new Date().toISOString();
  await setCloudSyncStatus({
    [CLOUD_SYNC_STATUS_KEY]: "syncing",
    [CLOUD_SYNC_LAST_ERROR_KEY]: "",
    [CLOUD_SYNC_LAST_REASON_KEY]: String(reason || "unknown"),
    [CLOUD_SYNC_LAST_ATTEMPT_AT_KEY]: attemptAt,
    [CLOUD_SYNC_LAST_ENDPOINT_KEY]: config.endpoint,
  });

  try {
    const localRaw = await getStorage("local", VOCAB_SYNC_ALL_KEYS);
    const outgoing = normalizeStampedVocabState(localRaw);
    const headers = {
      "content-type": "application/json",
      "x-techwordlearn-client": config.deviceId,
    };
    if (config.token) {
      headers.authorization = `Bearer ${config.token}`;
    }

    const response = await fetchWithTimeout(
      config.endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...outgoing,
          reason: String(reason || "unknown"),
          client: config.deviceId,
          extension_id: chrome.runtime && chrome.runtime.id ? chrome.runtime.id : "unknown",
        }),
      },
      CLOUD_REQUEST_TIMEOUT_MS
    );

    if (!response) {
      throw new Error("request_failed_or_timed_out");
    }
    if (!response.ok) {
      throw new Error(await readFailedResponseMessage(response));
    }

    const incomingRaw = await response.json().catch(() => null);
    if (!incomingRaw || typeof incomingRaw !== "object") {
      throw new Error("invalid_json_response");
    }
    if (incomingRaw.ok === false) {
      throw new Error(typeof incomingRaw.error === "string" ? incomingRaw.error : "remote_error");
    }

    const incoming = normalizeStampedVocabState(incomingRaw);
    const outgoingFp = vocabFingerprint(outgoing);
    const incomingFp = vocabFingerprint(incoming);
    const outgoingStampTs = parseStamp(outgoing[VOCAB_SYNC_STAMP_KEY]);
    const incomingStampTs = parseStamp(incoming[VOCAB_SYNC_STAMP_KEY]);

    let target = incoming;
    if (outgoingStampTs === incomingStampTs && outgoingFp !== incomingFp) {
      target = {
        ...mergeStatesPreferIncoming(outgoing, incoming),
        [VOCAB_SYNC_STAMP_KEY]: new Date().toISOString(),
      };
    }

    const changed = outgoingFp !== incomingFp || outgoingStampTs !== incomingStampTs;
    if (changed) {
      await writeLocalState(target, target[VOCAB_SYNC_STAMP_KEY]);
    }

    await setCloudSyncStatus({
      [CLOUD_SYNC_STATUS_KEY]: "ok",
      [CLOUD_SYNC_LAST_SYNCED_AT_KEY]: new Date().toISOString(),
      [CLOUD_SYNC_LAST_ERROR_KEY]: "",
      [CLOUD_SYNC_LAST_REASON_KEY]: String(reason || "unknown"),
      [CLOUD_SYNC_LAST_ATTEMPT_AT_KEY]: attemptAt,
      [CLOUD_SYNC_LAST_ENDPOINT_KEY]: config.endpoint,
    });
    return { ok: true, changed, stamp: target[VOCAB_SYNC_STAMP_KEY] };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    await setCloudSyncStatus({
      [CLOUD_SYNC_STATUS_KEY]: "error",
      [CLOUD_SYNC_LAST_ERROR_KEY]: msg,
      [CLOUD_SYNC_LAST_REASON_KEY]: String(reason || "unknown"),
      [CLOUD_SYNC_LAST_ATTEMPT_AT_KEY]: attemptAt,
      [CLOUD_SYNC_LAST_ENDPOINT_KEY]: config.endpoint,
    });
    console.warn(`[TechWordLearn] cloud sync failed (${reason}): ${msg}`);
    return { ok: false, error: msg };
  } finally {
    cloudSyncInFlight = false;
  }
}

function applyGlobalEnabledUi(enabled) {
  const isEnabled = Boolean(enabled);

  if (chrome.action) {
    if (chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: isEnabled ? "" : "OFF" });
    }
    if (chrome.action.setBadgeBackgroundColor && !isEnabled) {
      chrome.action.setBadgeBackgroundColor({ color: "#64748b" });
    }
    if (chrome.action.setTitle) {
      chrome.action.setTitle({
        title: isEnabled ? "TechWordLearn（已启用）" : "TechWordLearn（已停用）",
      });
    }
  }

  if (chrome.contextMenus && chrome.contextMenus.update) {
    chrome.contextMenus.update("add-tech-word", { enabled: isEnabled }, () => {
      void chrome.runtime.lastError;
    });
  }
}

async function refreshGlobalEnabledUi() {
  const items = await getStorage("local", [EXTENSION_ENABLED_KEY]);
  const enabled = items[EXTENSION_ENABLED_KEY] !== false;
  applyGlobalEnabledUi(enabled);
  return enabled;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.prototype.hasOwnProperty.call(changes, EXTENSION_ENABLED_KEY)) {
    const enabled = changes[EXTENSION_ENABLED_KEY].newValue !== false;
    applyGlobalEnabledUi(enabled);
    if (enabled) void reinjectOpenTabs();
  }
});

function isInjectableTabUrl(url) {
  return /^(https?:\/\/|file:\/\/)/i.test(String(url || ""));
}

function saveInjectDiag(payload) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) return;
  chrome.storage.local.set({ [INJECT_DIAG_KEY]: payload }, () => {
    void chrome.runtime.lastError;
  });
}

function recordInjectDiag(stage, tabId, url, extra) {
  saveInjectDiag({
    at: new Date().toISOString(),
    stage,
    tabId: tabId || null,
    url: String(url || ""),
    ...(extra && typeof extra === "object" ? extra : {}),
  });
}

function injectContentIntoTab(tabId, url) {
  if (!chrome.scripting || !chrome.scripting.executeScript || !chrome.scripting.insertCSS) return;
  if (!tabId) return;

  chrome.scripting.insertCSS(
    {
      target: { tabId, allFrames: true },
      files: ["styles.css"],
    },
    () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn(`[TechWordLearn] insertCSS failed tab=${tabId} url=${String(url || "")}: ${err.message}`);
        recordInjectDiag("css_error", tabId, url, { message: err.message || String(err) });
        return;
      }
    }
  );

  chrome.scripting.executeScript(
    {
      target: { tabId, allFrames: true },
      files: ["content.js"],
    },
    () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn(
          `[TechWordLearn] executeScript failed tab=${tabId} url=${String(url || "")}: ${err.message}`
        );
        recordInjectDiag("js_error", tabId, url, { message: err.message || String(err) });
        return;
      }
    }
  );
}

function ensureContentInTab(tabId, url) {
  if (!tabId || !chrome.tabs || !chrome.tabs.sendMessage) return;
  chrome.tabs.sendMessage(tabId, { action: "twl_ping" }, (response) => {
    const pingError = chrome.runtime.lastError;
    if (!pingError && response && response.ok) return;
    injectContentIntoTab(tabId, url);
  });
}

async function reinjectOpenTabs() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  const items = await getStorage("local", [EXTENSION_ENABLED_KEY]);
  if (items[EXTENSION_ENABLED_KEY] === false) return;

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      if (!tab || !tab.id) continue;
      const url = String(tab.url || "");
      if (url && !isInjectableTabUrl(url)) continue;
      ensureContentInTab(tab.id, url);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus && chrome.contextMenus.removeAll && chrome.contextMenus.create) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "add-tech-word",
        title: "把 \"%s\" 加入我的词库",
        contexts: ["selection"]
      });
      void refreshGlobalEnabledUi();
      reinjectOpenTabs();
    });
    return;
  }
  reinjectOpenTabs();
});

if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void refreshGlobalEnabledUi();
  });
}

if (chrome.contextMenus && chrome.contextMenus.onClicked && chrome.tabs && chrome.tabs.sendMessage) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "add-tech-word" || !info.selectionText || !tab?.id) return;

    void getStorage("local", [EXTENSION_ENABLED_KEY]).then((items) => {
      if (items[EXTENSION_ENABLED_KEY] === false) return;

      chrome.tabs.sendMessage(
        tab.id,
        { action: "prompt_for_definition", word: info.selectionText.trim() },
        () => {
          // 典型失败页面：chrome://、Chrome Web Store、内置 PDF viewer 等
          if (chrome.runtime.lastError) {
            console.warn("sendMessage failed:", chrome.runtime.lastError.message);
          }
        }
      );
    });
  });
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (!req || typeof req.action !== "string") return;

  if (req.action === "sync_cloud_now") {
    void syncViaCloud("manual_request").then(sendResponse);
    return true;
  }

  if (req.action === "increment_word_count") {
    void enqueueWordCountIncrement(req.word)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => {
        sendResponse({ ok: false, error: (err && err.message) || "count_update_failed" });
      });
    return true;
  }

  if (req.action !== "speak_word") return;

  const text = String(req.text || "").trim();
  if (!text) {
    sendResponse({ ok: false, error: "empty_text" });
    return;
  }

  let settled = false;
  let eventTimeout = null;
  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (eventTimeout) clearTimeout(eventTimeout);
    sendResponse(payload);
  };

  try {
    try {
      chrome.tts.stop();
    } catch (_) {}

    eventTimeout = setTimeout(() => {
      finish({ ok: false, error: "tts_timeout", eventType: "timeout" });
    }, 2500);

    if (!chrome.tts || !chrome.tts.speak) {
      finish({
        ok: false,
        error: "tts_unavailable",
        eventType: "unsupported",
      });
      return;
    }

    chrome.tts.speak(
      text,
      {
        lang: "en-US",
        rate: 1.0,
        pitch: 1.1,
        volume: 1.0,
        enqueue: false,
        requiredEventTypes: ["start", "end", "error"],
        onEvent: (event) => {
          if (!event) return;
          if (event.type === "error") {
            finish({
              ok: false,
              error: event.errorMessage || "tts_event_error",
              eventType: "error",
            });
            return;
          }
          if (event.type === "start" || event.type === "end") {
            finish({ ok: true, eventType: event.type });
          }
        },
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          finish({
            ok: false,
            error: err.message || "tts_speak_failed",
            eventType: "runtime_error",
          });
          return;
        }
      }
    );
  } catch (err) {
    finish({
      ok: false,
      error: (err && err.message) || "tts_speak_failed",
      eventType: "exception",
    });
  }

  return true;
});
