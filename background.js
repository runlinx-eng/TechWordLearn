console.log("[TechWordLearn] background.js active v1.5");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-tech-word",
      title: "Add \"%s\" to Tech Vocabulary",
      contexts: ["selection"]
    });
  });
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

  try {
    try {
      chrome.tts.stop();
    } catch (_) {}

    chrome.tts.speak(
      text,
      {
        lang: "en-US",
        rate: 1.0,
        pitch: 1.1,
        volume: 1.0,
        enqueue: false,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message || "tts_speak_failed" });
          return;
        }
        sendResponse({ ok: true });
      }
    );
  } catch (err) {
    sendResponse({ ok: false, error: (err && err.message) || "tts_speak_failed" });
  }

  return true;
});
