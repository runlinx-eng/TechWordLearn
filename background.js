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
