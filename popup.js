function renderStats() {
  chrome.storage.local.get(null, (items) => {
    const listDiv = document.getElementById("stats-list");
    const metaDiv = document.getElementById("meta");
    const lastErr = chrome.runtime.lastError;

    if (lastErr) {
      listDiv.innerHTML = `<p class="empty">${lastErr.message}</p>`;
      metaDiv.textContent = "Storage read failed.";
      return;
    }

    const weekKey = getCurrentWeekKey();
    const weeklyMap = sanitizeCountMap(items.weekly_word_counts && items.weekly_word_counts[weekKey]);
    let sortedWords = Object.entries(weeklyMap).sort((a, b) => b[1] - a[1]).slice(0, 50);
    let modeLabel = `Week ${weekKey}`;

    if (sortedWords.length === 0) {
      sortedWords = Object.entries(items)
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      modeLabel = "All Time (fallback)";
    }

    const customCount = Object.keys(items.custom_vocab || {}).length;
    const deletedCount = Array.isArray(items.deleted_vocab) ? items.deleted_vocab.length : 0;
    const backupCount = Array.isArray(items.vocab_backups) ? items.vocab_backups.length : 0;
    metaDiv.textContent =
      `${modeLabel} | Custom: ${customCount} | Hidden: ${deletedCount} | Snapshots: ${backupCount}`;

    if (sortedWords.length === 0) {
      listDiv.innerHTML = '<p class="empty">Go click highlighted words first.</p>';
      return;
    }

    let html = "<ul>";
    for (const [word, count] of sortedWords) {
      html += `
        <li>
          <span class="word">${word}</span>
          <span class="count">${count} times</span>
        </li>
      `;
    }
    html += "</ul>";
    listDiv.innerHTML = html;
  });
}

function sanitizeCountMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
    out[k] = Math.floor(v);
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

function openManager() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("open-vocab-manager").addEventListener("click", openManager);
  document.getElementById("refresh-stats").addEventListener("click", renderStats);
  renderStats();
});
