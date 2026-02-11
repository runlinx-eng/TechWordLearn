console.log("[TechWordLearn] background.js active v1.5");

function isInjectableTabUrl(url) {
  return /^(https?:\/\/|file:\/\/)/i.test(String(url || ""));
}

function injectContentIntoTab(tabId) {
  if (!tabId) return;

  chrome.scripting.insertCSS(
    {
      target: { tabId, allFrames: true },
      files: ["styles.css"],
    },
    () => {
      // chrome://、web store、内置页面会失败，忽略即可
      void chrome.runtime.lastError;
    }
  );

  chrome.scripting.executeScript(
    {
      target: { tabId, allFrames: true },
      files: ["content.js"],
    },
    () => {
      // 允许失败，不打断其它页面注入
      void chrome.runtime.lastError;
    }
  );
}

function reinjectOpenTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      if (!tab || !tab.id || !isInjectableTabUrl(tab.url)) continue;
      injectContentIntoTab(tab.id);
    }
  });
}

// service worker 被重载/唤醒时也主动补注入，避免旧页面残留失效 content script
reinjectOpenTabs();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-tech-word",
      title: "Add \"%s\" to Tech Vocabulary",
      contexts: ["selection"]
    });
    reinjectOpenTabs();
  });
});

chrome.runtime.onStartup.addListener(() => {
  reinjectOpenTabs();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "add-tech-word" || !info.selectionText || !tab?.id) return;

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

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (!req || req.action !== "speak_word") return;

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
