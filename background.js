console.log("[TechWordLearn] background.js active v1.13");

const VOCAB_SYNC_KEYS = ["custom_vocab", "deleted_vocab"];
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

function normalizeVocabState(raw) {
  const custom = sanitizeWordMap(raw && raw.custom_vocab);
  const deleted = sanitizeWordList(raw && raw.deleted_vocab).filter(
    (word) => !Object.prototype.hasOwnProperty.call(custom, word)
  );
  return { custom_vocab: custom, deleted_vocab: deleted };
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
  for (const word of Object.keys(mergedCustom)) {
    mergedDeletedSet.delete(word);
  }
  return {
    custom_vocab: mergedCustom,
    deleted_vocab: Array.from(mergedDeletedSet),
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
        title: isEnabled ? "TechWordLearn (enabled)" : "TechWordLearn (disabled)",
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

function isExplicitlyBlockedTabUrl(url) {
  return /^(about:|chrome:\/\/|chrome-extension:\/\/|devtools:\/\/|edge:\/\/|brave:\/\/)/i.test(
    String(url || "")
  );
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
  recordInjectDiag("inject_start", tabId, url);

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
      console.log(`[TechWordLearn] insertCSS ok tab=${tabId} url=${String(url || "")}`);
      recordInjectDiag("css_ok", tabId, url);
    }
  );

  chrome.scripting.executeScript(
    {
      target: { tabId, allFrames: true },
      files: ["content.js"],
    },
    (results) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn(
          `[TechWordLearn] executeScript failed tab=${tabId} url=${String(url || "")}: ${err.message}`
        );
        recordInjectDiag("js_error", tabId, url, { message: err.message || String(err) });
        return;
      }
      console.log(
        `[TechWordLearn] executeScript ok tab=${tabId} url=${String(url || "")} frames=${
          Array.isArray(results) ? results.length : 0
        }`
      );
      recordInjectDiag("js_ok", tabId, url, {
        frameResultCount: Array.isArray(results) ? results.length : 0,
      });
    }
  );
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
      injectContentIntoTab(tab.id, url);
    }
  });
}

async function maybeInjectTab(tabId, url) {
  if (!tabId) return;
  const normalizedUrl = String(url || "");
  if (normalizedUrl && !isInjectableTabUrl(normalizedUrl)) {
    if (isExplicitlyBlockedTabUrl(normalizedUrl)) {
      recordInjectDiag("skip_blocked_scheme", tabId, normalizedUrl);
      return;
    }
    recordInjectDiag("skip_unknown_scheme", tabId, normalizedUrl);
    return;
  }

  const items = await getStorage("local", [EXTENSION_ENABLED_KEY]);
  if (items[EXTENSION_ENABLED_KEY] === false) {
    recordInjectDiag("skip_extension_disabled", tabId, normalizedUrl);
    return;
  }
  injectContentIntoTab(tabId, normalizedUrl);
}

// service worker 被重载/唤醒时也主动补注入，避免旧页面残留失效 content script
reinjectOpenTabs();
void refreshGlobalEnabledUi();

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus && chrome.contextMenus.removeAll && chrome.contextMenus.create) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "add-tech-word",
        title: "Add \"%s\" to Tech Vocabulary",
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
    reinjectOpenTabs();
  });
}

if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tabId) return;
    if (changeInfo && changeInfo.status === "complete") {
      maybeInjectTab(tabId, (tab && tab.url) || "");
      return;
    }
    if (typeof changeInfo.url === "string") {
      maybeInjectTab(tabId, changeInfo.url);
    }
  });
}

if (chrome.tabs && chrome.tabs.onActivated && chrome.tabs.get) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!activeInfo || !activeInfo.tabId) return;
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      maybeInjectTab(activeInfo.tabId, (tab && tab.url) || "");
    });
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
