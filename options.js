const MAX_BACKUPS = 20;
const manualSync = globalThis.TechWordManualSync;
if (!manualSync) {
  throw new Error("TechWordLearn manual sync module failed to load");
}
const CLOUD_SYNC_STATUS_LABELS = {
  idle: "未启动",
  syncing: "同步中",
  ok: "已同步",
  error: "同步失败",
  disabled: "未启用",
};

let baseVocab = {};
let customVocab = {};
let wordCounts = {};
let weeklyWordCounts = {};
let deletedSet = new Set();
let masteredSet = new Set();
let backups = [];
let rows = [];
let currentFilter = "";
let currentSourceFilter = "all";
let editingWord = null;
let selectedWord = null;
let drawerMode = "detail";
let activeView = "main";
let selectedVersionId = null;
let currentVersionId = null;
let currentVersionMode = "live";
let pageViewMode = "live";
let isReadOnlyView = false;
let cloudSyncEnabled = false;
let cloudSyncEndpoint = "";
let cloudSyncToken = "";
let cloudSyncDeviceId = "";
let cloudSyncStatus = "idle";
let cloudSyncLastSyncedAt = "";
let cloudSyncLastError = "";
let cloudSyncLastReason = "";
let cloudSyncLastAttemptAt = "";
let manualSyncContext = null;
let manualSyncBusy = false;

const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const weeklySummaryEl = document.getElementById("weekly-summary");
const versionSummaryEl = document.getElementById("version-summary");
const activeVersionDisplayEl = document.getElementById("active-version-display");
const vocabSectionTitleEl = document.getElementById("vocab-section-title");
const cloudSyncSummaryEl = document.getElementById("cloud-sync-summary");
const manualSyncSummaryEl = document.getElementById("manual-sync-summary");

const searchInput = document.getElementById("search-input");
const tbody = document.getElementById("vocab-tbody");
const weeklyTopListEl = document.getElementById("weekly-top-list");
const versionListEl = document.getElementById("version-list");
const versionPreviewTitleEl = document.getElementById("version-preview-title");
const versionPreviewListEl = document.getElementById("version-preview-list");
const setCurrentVersionBtn = document.getElementById("set-current-version-btn");
const viewLiveBtn = document.getElementById("view-live-btn");

const editorTitleEl = document.getElementById("editor-title");
const editForm = document.getElementById("edit-form");
const wordInput = document.getElementById("word-input");
const defInput = document.getElementById("def-input");
const saveBtn = document.getElementById("save-btn");
const resetFormBtn = document.getElementById("reset-form-btn");
const cloudSyncEnabledInput = document.getElementById("cloud-sync-enabled");
const cloudSyncEndpointInput = document.getElementById("cloud-sync-endpoint");
const cloudSyncTokenInput = document.getElementById("cloud-sync-token");
const saveCloudSyncBtn = document.getElementById("save-cloud-sync-btn");
const syncCloudNowBtn = document.getElementById("sync-cloud-now-btn");
const checkManualSyncBtn = document.getElementById("check-manual-sync-btn");
const uploadManualSyncBtn = document.getElementById("upload-manual-sync-btn");
const downloadManualSyncBtn = document.getElementById("download-manual-sync-btn");

const mainViewEl = document.getElementById("main-view");
const statsViewEl = document.getElementById("stats-view");
const syncViewEl = document.getElementById("sync-view");
const versionsViewEl = document.getElementById("versions-view");
const topbarActionsEl = document.getElementById("topbar-actions");
const moreMenuBtn = document.getElementById("more-menu-btn");
const maintenanceMenuEl = document.getElementById("maintenance-menu");
const cloudSettingsToggleBtn = document.getElementById("cloud-settings-toggle-btn");
const cloudSettingsPanelEl = document.getElementById("cloud-settings-panel");

const filterButtons = {
  all: document.getElementById("filter-all-btn"),
  custom: document.getElementById("filter-custom-btn"),
  base: document.getElementById("filter-base-btn"),
  hidden: document.getElementById("filter-hidden-btn"),
};

const drawerLayerEl = document.getElementById("drawer-layer");
const drawerTitleEl = document.getElementById("drawer-title");
const wordDetailViewEl = document.getElementById("word-detail-view");
const wordEditViewEl = document.getElementById("word-edit-view");
const detailDefinitionEl = document.getElementById("detail-definition");
const detailSourceEl = document.getElementById("detail-source");
const detailCountEl = document.getElementById("detail-count");
const editDetailBtn = document.getElementById("edit-detail-btn");
const restoreBaselineBtn = document.getElementById("restore-baseline-btn");
const unhideWordBtn = document.getElementById("unhide-word-btn");
const hideWordBtn = document.getElementById("hide-word-btn");
const deleteWordBtn = document.getElementById("delete-word-btn");

function normalizeWord(raw) {
  const m = String(raw || "").match(/[A-Za-z][A-Za-z'-]*/);
  return m ? m[0].toLowerCase() : null;
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

function sanitizeWordMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    if (typeof v !== "string") continue;
    const key = normalizeWord(k);
    const value = v.trim();
    if (!key || value === "") continue;
    out[key] = value;
  }
  return out;
}

function sanitizeWordList(raw) {
  if (!Array.isArray(raw)) return [];
  const next = [];
  const seen = new Set();
  for (const item of raw) {
    const key = normalizeWord(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next;
}

function sanitizeWordCountMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeWord(k);
    if (!key || key !== k) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
    out[key] = Math.floor(v);
  }
  return out;
}

function extractWordCounts(items) {
  const out = {};
  if (!items || typeof items !== "object") return out;
  for (const [key, value] of Object.entries(items)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const normalized = normalizeWord(key);
    if (!normalized || normalized !== key) continue;
    out[key] = Math.floor(value);
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

function currentWeekCountMap() {
  const weekKey = getCurrentWeekKey();
  return sanitizeWordCountMap(weeklyWordCounts[weekKey]);
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function setStatus(text, isError = false) {
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#475569";
  statusEl.style.background = isError ? "#fee2e2" : "#edf2f7";
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function shortText(text, maxLen) {
  const s = String(text || "");
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

function cloudSyncReadyFromInputs() {
  return cloudSyncEnabledInput.checked && Boolean(sanitizeCloudEndpoint(cloudSyncEndpointInput.value));
}

function updateCloudSyncActionState() {
  syncCloudNowBtn.disabled = !cloudSyncReadyFromInputs();
}

function renderCloudSyncPanel() {
  cloudSyncEnabledInput.checked = cloudSyncEnabled;
  cloudSyncEndpointInput.value = cloudSyncEndpoint;
  cloudSyncTokenInput.value = cloudSyncToken;
  updateCloudSyncActionState();

  const statusLabel = CLOUD_SYNC_STATUS_LABELS[cloudSyncStatus] || CLOUD_SYNC_STATUS_LABELS.idle;
  const endpointHost = sanitizeCloudEndpoint(cloudSyncEndpoint)
    ? new URL(sanitizeCloudEndpoint(cloudSyncEndpoint)).host
    : "未配置端点";

  if (!cloudSyncEnabled) {
    cloudSyncSummaryEl.textContent = "当前关闭。多台设备使用相同的服务器设置后即可共享词库。";
    cloudSettingsToggleBtn.textContent = cloudSettingsPanelEl.hidden
      ? cloudSyncEndpoint
        ? "查看设置"
        : "设置"
      : "收起设置";
    return;
  }

  const parts = [`状态: ${statusLabel}`, `端点: ${endpointHost}`];
  if (cloudSyncLastSyncedAt) {
    parts.push(`最近成功: ${formatTime(cloudSyncLastSyncedAt)}`);
  } else if (cloudSyncLastAttemptAt) {
    parts.push(`最近尝试: ${formatTime(cloudSyncLastAttemptAt)}`);
  }
  if (cloudSyncLastReason) {
    parts.push(`触发: ${cloudSyncLastReason}`);
  }
  if (cloudSyncLastError) {
    parts.push(`错误: ${cloudSyncLastError}`);
  }
  if (cloudSyncDeviceId) {
    parts.push(`设备ID: ${cloudSyncDeviceId.slice(0, 8)}`);
  }
  cloudSyncSummaryEl.textContent = parts.join(" | ");
  cloudSettingsToggleBtn.textContent = cloudSettingsPanelEl.hidden ? "查看设置" : "收起设置";
}

function showView(viewName) {
  activeView = ["stats", "sync", "versions"].includes(viewName) ? viewName : "main";
  mainViewEl.hidden = activeView !== "main";
  statsViewEl.hidden = activeView !== "stats";
  syncViewEl.hidden = activeView !== "sync";
  versionsViewEl.hidden = activeView !== "versions";
  summaryEl.hidden = activeView !== "main";
  topbarActionsEl.hidden = activeView !== "main";
  maintenanceMenuEl.hidden = true;
  moreMenuBtn.setAttribute("aria-expanded", "false");
  closeDrawer();

  if (activeView === "main" && pageViewMode === "version") {
    pageViewMode = "live";
    renderAll();
  }
  if (typeof window.scrollTo === "function") {
    window.scrollTo(0, 0);
  }
}

function toggleMaintenanceMenu() {
  const opening = maintenanceMenuEl.hidden;
  maintenanceMenuEl.hidden = !opening;
  moreMenuBtn.setAttribute("aria-expanded", opening ? "true" : "false");
}

function toggleCloudSettings() {
  const opening = cloudSettingsPanelEl.hidden;
  cloudSettingsPanelEl.hidden = !opening;
  cloudSettingsToggleBtn.setAttribute("aria-expanded", opening ? "true" : "false");
  cloudSettingsToggleBtn.textContent = opening ? "收起设置" : cloudSyncEndpoint || cloudSyncEnabled ? "查看设置" : "设置";
}

function setSourceFilter(filterName) {
  currentSourceFilter = Object.prototype.hasOwnProperty.call(filterButtons, filterName) ? filterName : "all";
  renderTable();
}

function storageGet(areaName, keys) {
  return new Promise((resolve, reject) => {
    const area = chrome.storage && chrome.storage[areaName];
    if (!area || typeof area.get !== "function") {
      reject(new Error(`storage_${areaName}_unavailable`));
      return;
    }
    area.get(keys, (items) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message));
        return;
      }
      resolve(items || {});
    });
  });
}

function storageSet(areaName, payload) {
  return new Promise((resolve, reject) => {
    const area = chrome.storage && chrome.storage[areaName];
    if (!area || typeof area.set !== "function") {
      reject(new Error(`storage_${areaName}_unavailable`));
      return;
    }
    area.set(payload, () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(areaName, keys) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(keys) || keys.length === 0) {
      resolve();
      return;
    }
    const area = chrome.storage && chrome.storage[areaName];
    if (!area || typeof area.remove !== "function") {
      reject(new Error(`storage_${areaName}_unavailable`));
      return;
    }
    area.remove(keys, () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message));
        return;
      }
      resolve();
    });
  });
}

function storageBytesInUse(areaName) {
  return new Promise((resolve, reject) => {
    const area = chrome.storage && chrome.storage[areaName];
    if (!area || typeof area.getBytesInUse !== "function") {
      resolve(0);
      return;
    }
    area.getBytesInUse(null, (bytes) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message));
        return;
      }
      resolve(Number(bytes) || 0);
    });
  });
}

function makeManualDeviceId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `twl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureManualDeviceId(existingId) {
  const current = typeof existingId === "string" ? existingId.trim() : "";
  if (current) return current;
  const deviceId = makeManualDeviceId();
  await storageSet("local", { [manualSync.LOCAL_DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

async function inspectManualSync() {
  const localKeys = [
    "custom_vocab",
    "deleted_vocab",
    "mastered_list",
    "vocab_backups",
    manualSync.LOCAL_BASE_REVISION_KEY,
    manualSync.LOCAL_BASE_FINGERPRINT_KEY,
    manualSync.LOCAL_DEVICE_ID_KEY,
    manualSync.LOCAL_LAST_SYNCED_AT_KEY,
  ];
  const [localItems, remoteItems] = await Promise.all([
    storageGet("local", localKeys),
    storageGet("sync", null),
  ]);
  const localState = manualSync.normalizeState(localItems);
  const [localFingerprint, remote] = await Promise.all([
    manualSync.stateFingerprint(localState),
    manualSync.decodeSnapshot(remoteItems),
  ]);
  let baseFingerprint =
    typeof localItems[manualSync.LOCAL_BASE_FINGERPRINT_KEY] === "string"
      ? localItems[manualSync.LOCAL_BASE_FINGERPRINT_KEY]
      : "";
  if (
    remote &&
    remote.transportFingerprint &&
    baseFingerprint === remote.transportFingerprint
  ) {
    baseFingerprint = remote.fingerprint;
  } else if (baseFingerprint) {
    const localSchemaTwoFingerprint = await manualSync.stateFingerprintForSchema(localState, 2);
    if (baseFingerprint === localSchemaTwoFingerprint) {
      baseFingerprint = await manualSync.stateFingerprint({
        ...localState,
        mastered_list: [],
      });
    }
  }
  const rawBaseRevision = Number(localItems[manualSync.LOCAL_BASE_REVISION_KEY]);
  const baseRevision = Number.isSafeInteger(rawBaseRevision) && rawBaseRevision >= 0 ? rawBaseRevision : 0;
  return {
    localItems,
    remoteItems,
    localState,
    localFingerprint,
    remote,
    baseFingerprint,
    baseRevision,
    status: manualSync.classifyState(localFingerprint, remote, baseFingerprint),
  };
}

function setManualSyncBusy(busy) {
  manualSyncBusy = Boolean(busy);
  checkManualSyncBtn.disabled = manualSyncBusy;
  uploadManualSyncBtn.disabled = manualSyncBusy;
  downloadManualSyncBtn.disabled = manualSyncBusy;
}

function hideManualSyncActions() {
  uploadManualSyncBtn.hidden = true;
  downloadManualSyncBtn.hidden = true;
}

function manualSyncCounts(state) {
  const normalized = manualSync.normalizeState(state);
  return `${Object.keys(normalized.custom_vocab).length} 个自己添加或修改，${normalized.deleted_vocab.length} 个已隐藏，${normalized.mastered_list.length} 个已掌握`;
}

function remoteNeedsSnapshotMigration(remote) {
  if (!remote) return false;
  if (remote.kind === "legacy") return true;
  return remote.kind === "snapshot" && remote.schemaVersion < manualSync.SCHEMA_VERSION;
}

function renderManualSyncContext(context) {
  manualSyncContext = context;
  hideManualSyncActions();
  uploadManualSyncBtn.textContent = "使用本机词库上传";
  downloadManualSyncBtn.textContent = "使用其他设备词库下载";

  const localLabel = `本机：${manualSyncCounts(context.localState)}`;
  const remoteLabel = context.remote
    ? `共享：${manualSyncCounts(context.remote.state)}，版本 ${context.remote.revision}`
    : "共享：尚无快照";

  if (context.status === "in_sync") {
    if (remoteNeedsSnapshotMigration(context.remote)) {
      manualSyncSummaryEl.textContent = `${localLabel}；${remoteLabel}。内容一致，但共享区仍是旧格式，可点击迁移。`;
      uploadManualSyncBtn.textContent = "迁移为安全分块快照";
      uploadManualSyncBtn.hidden = false;
      return;
    }
    manualSyncSummaryEl.textContent = `${localLabel}；${remoteLabel}。两边内容一致。`;
    return;
  }

  if (context.status === "remote_missing") {
    manualSyncSummaryEl.textContent = `${localLabel}；${remoteLabel}。可手动创建第一份共享快照。`;
    uploadManualSyncBtn.textContent = "创建共享快照";
    uploadManualSyncBtn.hidden = false;
    return;
  }

  if (context.status === "local_ahead") {
    manualSyncSummaryEl.textContent = `${localLabel}；${remoteLabel}。仅本机有新变化，可手动上传。`;
    uploadManualSyncBtn.textContent = "上传本机变更";
    uploadManualSyncBtn.hidden = false;
    return;
  }

  if (context.status === "remote_ahead") {
    manualSyncSummaryEl.textContent = `${localLabel}；${remoteLabel}。仅共享快照有新变化，可手动下载。`;
    downloadManualSyncBtn.textContent = "下载共享变更";
    downloadManualSyncBtn.hidden = false;
    return;
  }

  manualSyncSummaryEl.textContent =
    `${localLabel}；${remoteLabel}。两边都可能有变化，不会自动合并；请选择要保留的一边。`;
  uploadManualSyncBtn.textContent = "用本机覆盖共享";
  downloadManualSyncBtn.textContent = "用共享覆盖本机";
  uploadManualSyncBtn.hidden = false;
  downloadManualSyncBtn.hidden = false;
}

function manualSyncErrorMessage(err) {
  const code = err && err.message ? err.message : String(err);
  const messages = {
    snapshot_exceeds_safe_sync_capacity: "词库快照超过 Chrome Sync 的安全容量，请先导出备份并精简词库",
    snapshot_item_exceeds_sync_quota: "词库分块仍超过 Chrome Sync 单项配额",
    sync_snapshot_hash_mismatch: "共享快照哈希不一致，已拒绝读取",
    sync_chunk_missing: "共享快照缺少分块，已拒绝读取",
    sync_snapshot_invalid_json: "共享快照格式无效，已拒绝读取",
    sync_snapshot_not_canonical: "共享快照格式异常，已拒绝读取",
    unsupported_sync_schema: "共享快照版本暂不受支持",
    sync_changed_during_upload: "上传期间共享快照被另一台设备修改，请重新检查",
    sync_quota_would_be_exceeded: "写入会超过 Chrome Sync 总容量，未执行上传",
  };
  return messages[code] || code;
}

async function checkManualSyncStatus() {
  if (manualSyncBusy) return;
  setManualSyncBusy(true);
  hideManualSyncActions();
  manualSyncSummaryEl.textContent = "正在读取并校验共享快照...";
  try {
    const context = await inspectManualSync();
    if (
      context.status === "in_sync" &&
      context.remote &&
      context.remote.kind === "snapshot" &&
      context.baseFingerprint !== context.remote.fingerprint
    ) {
      const deviceId = await ensureManualDeviceId(
        context.localItems[manualSync.LOCAL_DEVICE_ID_KEY]
      );
      await storageSet("local", {
        [manualSync.LOCAL_BASE_REVISION_KEY]: context.remote.revision,
        [manualSync.LOCAL_BASE_FINGERPRINT_KEY]: context.remote.fingerprint,
        [manualSync.LOCAL_DEVICE_ID_KEY]: deviceId,
        [manualSync.LOCAL_LAST_SYNCED_AT_KEY]: new Date().toISOString(),
      });
      context.baseRevision = context.remote.revision;
      context.baseFingerprint = context.remote.fingerprint;
    }
    renderManualSyncContext(context);
    setStatus("手动同步状态检查完成");
  } catch (err) {
    manualSyncContext = null;
    manualSyncSummaryEl.textContent = `检查失败：${manualSyncErrorMessage(err)}`;
    setStatus(`手动同步检查失败: ${manualSyncErrorMessage(err)}`, true);
  } finally {
    setManualSyncBusy(false);
  }
}

function uploadAllowed(context) {
  if (!context) return false;
  if (context.status === "in_sync") return remoteNeedsSnapshotMigration(context.remote);
  return ["remote_missing", "local_ahead", "conflict", "conflict_unlinked"].includes(context.status);
}

async function uploadManualSnapshot() {
  if (manualSyncBusy) return;
  setManualSyncBusy(true);
  try {
    const context = await inspectManualSync();
    renderManualSyncContext(context);
    if (!uploadAllowed(context)) {
      setStatus("同步状态已变化，请按当前提示选择操作", true);
      return;
    }
    const warning = context.remote
      ? `将以本机词库（${manualSyncCounts(context.localState)}）覆盖共享快照。继续？`
      : `将以本机词库（${manualSyncCounts(context.localState)}）创建共享快照。继续？`;
    if (!window.confirm(warning)) return;

    const deviceId = await ensureManualDeviceId(
      context.localItems[manualSync.LOCAL_DEVICE_ID_KEY]
    );
    const nextRevision = Math.max(context.baseRevision, context.remote ? context.remote.revision : 0) + 1;
    const snapshot = await manualSync.buildSnapshot(context.localState, {
      revision: nextRevision,
      deviceId,
    });
    const currentBytes = await storageBytesInUse("sync");
    const projectedBytes = currentBytes + manualSync.itemsStorageBytes(snapshot.chunkItems);
    const syncQuota = Number(chrome.storage.sync.QUOTA_BYTES) || 102400;
    if (projectedBytes > Math.floor(syncQuota * 0.96)) {
      throw new Error("sync_quota_would_be_exceeded");
    }

    await storageSet("sync", snapshot.chunkItems);
    await storageSet("sync", { [manualSync.META_KEY]: snapshot.meta });

    const verifyItems = await storageGet("sync", null);
    const verified = await manualSync.decodeSnapshot(verifyItems);
    if (
      !verified ||
      verified.kind !== "snapshot" ||
      verified.generation !== snapshot.generation ||
      verified.fingerprint !== snapshot.fingerprint
    ) {
      throw new Error("sync_changed_during_upload");
    }

    const staleKeys = manualSync.staleManagedKeys(verifyItems, snapshot.generation);
    let cleanupWarning = "";
    try {
      await storageRemove("sync", staleKeys);
    } catch (err) {
      cleanupWarning = `；旧分块清理失败：${manualSyncErrorMessage(err)}`;
    }
    const syncedAt = new Date().toISOString();
    await storageSet("local", {
      [manualSync.LOCAL_BASE_REVISION_KEY]: snapshot.meta.revision,
      [manualSync.LOCAL_BASE_FINGERPRINT_KEY]: snapshot.fingerprint,
      [manualSync.LOCAL_DEVICE_ID_KEY]: deviceId,
      [manualSync.LOCAL_LAST_SYNCED_AT_KEY]: syncedAt,
    });

    const updated = await inspectManualSync();
    renderManualSyncContext(updated);
    setStatus(`手动上传完成，版本 ${snapshot.meta.revision}${cleanupWarning}`, Boolean(cleanupWarning));
  } catch (err) {
    setStatus(`手动上传失败: ${manualSyncErrorMessage(err)}`, true);
    manualSyncSummaryEl.textContent = `上传失败：${manualSyncErrorMessage(err)}`;
  } finally {
    setManualSyncBusy(false);
  }
}

async function downloadManualSnapshot() {
  if (manualSyncBusy) return;
  setManualSyncBusy(true);
  try {
    const context = await inspectManualSync();
    renderManualSyncContext(context);
    if (!context.remote || context.status === "in_sync") {
      setStatus("共享词库没有需要下载的变化", true);
      return;
    }
    if (
      !window.confirm(
        `将使用共享词库（${manualSyncCounts(context.remote.state)}）覆盖本机；当前本机词库会先保存为可恢复版本。继续？`
      )
    ) {
      return;
    }

    const deviceId = await ensureManualDeviceId(
      context.localItems[manualSync.LOCAL_DEVICE_ID_KEY]
    );
    const downloadedAt = new Date().toISOString();
    const beforeDownload = {
      id: makeId(),
      at: downloadedAt,
      label: `before_manual_sync_download:r${context.remote.revision}`,
      custom_vocab: context.localState.custom_vocab,
      deleted_vocab: context.localState.deleted_vocab,
      mastered_list: context.localState.mastered_list,
    };
    const storedBackups = Array.isArray(context.localItems.vocab_backups)
      ? context.localItems.vocab_backups
      : backups;
    const nextBackups = [beforeDownload, ...storedBackups].slice(0, MAX_BACKUPS);
    await storageSet("local", {
      custom_vocab: context.remote.state.custom_vocab,
      deleted_vocab: context.remote.state.deleted_vocab,
      mastered_list: context.remote.state.mastered_list,
      vocab_backups: nextBackups,
      current_vocab_version_id: null,
      current_vocab_mode: "live",
      vocab_sync_updated_at: context.remote.updatedAt || downloadedAt,
      [manualSync.LOCAL_BASE_REVISION_KEY]: context.remote.revision,
      [manualSync.LOCAL_BASE_FINGERPRINT_KEY]: context.remote.fingerprint,
      [manualSync.LOCAL_DEVICE_ID_KEY]: deviceId,
      [manualSync.LOCAL_LAST_SYNCED_AT_KEY]: downloadedAt,
    });

    customVocab = context.remote.state.custom_vocab;
    deletedSet = new Set(context.remote.state.deleted_vocab);
    masteredSet = new Set(context.remote.state.mastered_list);
    backups = nextBackups;
    currentVersionId = null;
    currentVersionMode = "live";
    pageViewMode = "live";
    renderAll();
    const updated = await inspectManualSync();
    renderManualSyncContext(updated);
    setStatus(`手动下载完成，共享版本 ${context.remote.revision}`);
  } catch (err) {
    setStatus(`手动下载失败: ${manualSyncErrorMessage(err)}`, true);
    manualSyncSummaryEl.textContent = `下载失败：${manualSyncErrorMessage(err)}`;
  } finally {
    setManualSyncBusy(false);
  }
}

function buildEffectiveVocab(custom, deletedWordSet) {
  const merged = { ...baseVocab, ...custom };
  deletedWordSet.forEach((word) => {
    delete merged[word];
  });
  return merged;
}

function currentEffectiveVocab() {
  return buildEffectiveVocab(customVocab, deletedSet);
}

function rankRowsForVocab(vocabMap, limit, preferWeekly) {
  const weekMap = currentWeekCountMap();
  const items = Object.entries(vocabMap).map(([word, definition]) => ({
    word,
    definition,
    weekCount: weekMap[word] || 0,
    totalCount: wordCounts[word] || 0,
  }));

  const byWeekly = items
    .filter((it) => it.weekCount > 0)
    .sort((a, b) => b.weekCount - a.weekCount || b.totalCount - a.totalCount || a.word.localeCompare(b.word));

  if (preferWeekly && byWeekly.length > 0) {
    return byWeekly.slice(0, limit);
  }

  const byTotal = items
    .filter((it) => it.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount || a.word.localeCompare(b.word));

  if (byTotal.length > 0) {
    return byTotal.slice(0, limit);
  }

  return items.sort((a, b) => a.word.localeCompare(b.word)).slice(0, limit);
}

function mergeRows(viewCustom, viewDeleted) {
  const customMap = viewCustom || customVocab;
  const deletedWordSet = viewDeleted || deletedSet;
  const merged = {};
  for (const [word, def] of Object.entries(baseVocab)) {
    if (deletedWordSet.has(word)) continue;
    merged[word] = {
      word,
      definition: def,
      count: wordCounts[word] || 0,
      hasBase: true,
      hasCustom: false,
    };
  }

  for (const [word, def] of Object.entries(customMap)) {
    if (deletedWordSet.has(word)) continue;
    const hasBase = Object.prototype.hasOwnProperty.call(baseVocab, word);
    merged[word] = {
      word,
      definition: def,
      count: wordCounts[word] || 0,
      hasBase,
      hasCustom: true,
    };
  }

  rows = Object.values(merged).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function hiddenRowsForState(viewCustom, viewDeleted) {
  const customMap = viewCustom || customVocab;
  const deletedWordSet = viewDeleted || deletedSet;
  return Array.from(deletedWordSet)
    .map((word) => {
      const hasBase = Object.prototype.hasOwnProperty.call(baseVocab, word);
      const hasCustom = Object.prototype.hasOwnProperty.call(customMap, word);
      return {
        word,
        definition: hasCustom ? customMap[word] : baseVocab[word] || "",
        count: wordCounts[word] || 0,
        hasBase,
        hasCustom,
        hidden: true,
      };
    })
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function rowMatchesFilter(row) {
  if (!currentFilter) return true;
  return row.word.includes(currentFilter) || row.definition.toLowerCase().includes(currentFilter);
}

function rowsForCurrentSourceFilter() {
  if (currentSourceFilter === "hidden") {
    return hiddenRowsForState(customVocab, deletedSet);
  }
  if (currentSourceFilter === "custom") {
    return rows.filter((row) => row.hasCustom);
  }
  if (currentSourceFilter === "base") {
    return rows.filter((row) => row.hasBase && !row.hasCustom);
  }
  return rows;
}

function renderFilterState() {
  for (const [filterName, button] of Object.entries(filterButtons)) {
    const active = filterName === currentSourceFilter;
    button.className = `filter-tab${active ? " active" : ""}`;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const titles = {
    all: "我的词库",
    custom: "你添加或修改过的词",
    base: "默认词",
    hidden: "已隐藏的词",
  };
  vocabSectionTitleEl.textContent = titles[currentSourceFilter] || titles.all;
}

function renderTable() {
  tbody.innerHTML = "";
  renderFilterState();
  const filtered = rowsForCurrentSourceFilter().filter(rowMatchesFilter);

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = currentSourceFilter === "hidden" ? "没有已隐藏的词" : "没有匹配的单词";
    tbody.appendChild(empty);
    return;
  }

  const makeItem = (row) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "vocab-item-row";
    item.setAttribute("role", "listitem");
    item.setAttribute(
      "aria-label",
      `${row.word}，点读 ${row.count || 0} 次${row.hidden ? "，已隐藏" : ""}`
    );
    item.addEventListener("click", () => openWordDetail(row.word));

    const word = document.createElement("span");
    word.className = "row-word";
    word.textContent = row.word;

    const count = document.createElement("span");
    count.className = "row-count";
    count.textContent = String(row.count || 0);

    const chevron = document.createElement("span");
    chevron.className = "row-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    item.appendChild(word);
    item.appendChild(count);
    item.appendChild(chevron);
    return item;
  };

  for (let index = 0; index < filtered.length; index += 2) {
    const pair = document.createElement("div");
    pair.className = "vocab-pair-row";
    pair.appendChild(makeItem(filtered[index]));
    if (filtered[index + 1]) pair.appendChild(makeItem(filtered[index + 1]));
    tbody.appendChild(pair);
  }
}

function renderWeeklyTop(viewVocabMap) {
  const vocab = viewVocabMap || currentEffectiveVocab();
  weeklyTopListEl.innerHTML = "";

  const topRows = rankRowsForVocab(vocab, 10, true);
  const weekKey = getCurrentWeekKey();
  const weeklyMap = currentWeekCountMap();
  const weekWords = Object.keys(weeklyMap).length;

  if (topRows.length === 0) {
    weeklySummaryEl.textContent = `周次 ${weekKey} | 暂无记录`;
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "本周还没有点击记录。";
    weeklyTopListEl.appendChild(empty);
    return;
  }

  weeklySummaryEl.textContent = `周次 ${weekKey} | 本周已记录 ${weekWords} 个词`;

  topRows.forEach((row, idx) => {
    const line = document.createElement("div");
    line.className = "weekly-row";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `#${idx + 1}`;

    const word = document.createElement("span");
    word.className = "word";
    word.textContent = `${row.word} · ${shortText(row.definition, 28)}`;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = row.weekCount > 0 ? `${row.weekCount}次` : `${row.totalCount}次(总)`;

    line.appendChild(rank);
    line.appendChild(word);
    line.appendChild(count);
    weeklyTopListEl.appendChild(line);
  });
}

function latestThreeVersions() {
  const latest = backups.slice(0, 3);
  if (currentVersionMode !== "version" || !currentVersionId) return latest;
  if (latest.some((item) => item.id === currentVersionId)) return latest;

  const currentSnapshot = backups.find((item) => item.id === currentVersionId);
  if (!currentSnapshot) return latest;

  if (latest.length < 3) {
    return [...latest, currentSnapshot];
  }
  return [latest[0], latest[1], currentSnapshot];
}

function snapshotToVocab(snapshot) {
  const custom = sanitizeWordMap(snapshot && snapshot.custom_vocab);
  const deleted = new Set(sanitizeWordList(snapshot && snapshot.deleted_vocab));
  return buildEffectiveVocab(custom, deleted);
}

function snapshotDisplayText(snapshot) {
  if (!snapshot) return "Unknown";
  return `${formatTime(snapshot.at)} · ${snapshot.label || "manual"}`;
}

function getCurrentViewSnapshot() {
  if (pageViewMode !== "version" || !selectedVersionId) return null;
  return backups.find((item) => item.id === selectedVersionId) || null;
}

function getDisplayedVocabState() {
  const snapshot = getCurrentViewSnapshot();
  if (!snapshot) {
    return {
      mode: "live",
      snapshot: null,
      custom: sanitizeWordMap(customVocab),
      deleted: new Set(sanitizeWordList(Array.from(deletedSet))),
      effective: currentEffectiveVocab(),
    };
  }

  const custom = sanitizeWordMap(snapshot.custom_vocab);
  const deleted = new Set(sanitizeWordList(snapshot.deleted_vocab));
  return {
    mode: "version",
    snapshot,
    custom,
    deleted,
    effective: buildEffectiveVocab(custom, deleted),
  };
}

function renderViewContext(viewState) {
  if (viewState.mode === "version" && viewState.snapshot) {
    vocabSectionTitleEl.textContent = `词库预览：${snapshotDisplayText(viewState.snapshot)}`;
    editorTitleEl.textContent = "添加或修改单词（版本预览只读）";
    return;
  }

  vocabSectionTitleEl.textContent = "我的词库";
  if (!editingWord) {
    editorTitleEl.textContent = "添加或修改单词";
  }
}

function renderEditorReadonlyState(viewState) {
  const readonly = viewState.mode === "version";
  wordInput.disabled = readonly;
  defInput.disabled = readonly;
  saveBtn.disabled = readonly;
  resetFormBtn.disabled = readonly;
}

function renderActiveVersionDisplay(list) {
  const activeCount = Object.keys(currentEffectiveVocab()).length;
  if (currentVersionMode === "version" && currentVersionId) {
    const currentSnapshot =
      backups.find((item) => item.id === currentVersionId) ||
      list.find((item) => item.id === currentVersionId) ||
      null;
    if (currentSnapshot) {
      activeVersionDisplayEl.textContent = `${activeCount} 个词 · 历史版本 ${formatTime(currentSnapshot.at)}`;
      return;
    }
    activeVersionDisplayEl.textContent = `${activeCount} 个词 · 历史版本`;
    return;
  }
  activeVersionDisplayEl.textContent = `${activeCount} 个词`;
}

function versionDiffRows(snapshot) {
  const versionVocab = snapshotToVocab(snapshot);
  const liveVocab = currentEffectiveVocab();
  const words = new Set([...Object.keys(versionVocab), ...Object.keys(liveVocab)]);
  const diffs = [];

  for (const word of words) {
    const versionHas = Object.prototype.hasOwnProperty.call(versionVocab, word);
    const liveHas = Object.prototype.hasOwnProperty.call(liveVocab, word);
    if (!versionHas && liveHas) {
      diffs.push({ kind: "当前新增", word, detail: liveVocab[word] });
      continue;
    }
    if (versionHas && !liveHas) {
      diffs.push({ kind: "当前已移除", word, detail: versionVocab[word] });
      continue;
    }
    if (versionVocab[word] !== liveVocab[word]) {
      diffs.push({ kind: "释义已修改", word, detail: `${versionVocab[word]} → ${liveVocab[word]}` });
    }
  }

  const versionMastered = new Set(sanitizeWordList(snapshot && snapshot.mastered_list));
  const masteryWords = new Set([...versionMastered, ...masteredSet]);
  for (const word of masteryWords) {
    const versionHas = versionMastered.has(word);
    const liveHas = masteredSet.has(word);
    if (!versionHas && liveHas) {
      diffs.push({ kind: "当前已掌握", word, detail: "当前已退出重点排行" });
    } else if (versionHas && !liveHas) {
      diffs.push({ kind: "当前未掌握", word, detail: "恢复后会退出重点排行" });
    }
  }

  return diffs.sort((a, b) => a.kind.localeCompare(b.kind) || a.word.localeCompare(b.word));
}

function renderVersionPreview(list) {
  versionPreviewListEl.innerHTML = "";

  const selected = list.find((item) => item.id === selectedVersionId) || null;
  if (!selected) {
    versionPreviewTitleEl.textContent = "请选择一个版本";
    setCurrentVersionBtn.textContent = "设置为当前版本";
    setCurrentVersionBtn.disabled = true;
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "没有可预览的版本。";
    versionPreviewListEl.appendChild(empty);
    return;
  }

  const isCurrent = currentVersionMode === "version" && currentVersionId === selected.id;
  setCurrentVersionBtn.textContent = isCurrent ? "已是当前版本" : "恢复此版本";
  setCurrentVersionBtn.disabled = isCurrent;
  versionPreviewTitleEl.textContent = `${formatTime(selected.at)} · 与当前词库相比`;

  const diffs = versionDiffRows(selected);
  if (diffs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "这个版本与当前词库没有差异。";
    versionPreviewListEl.appendChild(empty);
    return;
  }

  const added = diffs.filter((row) => row.kind === "当前新增").length;
  const removed = diffs.filter((row) => row.kind === "当前已移除").length;
  const modified = diffs.filter((row) => row.kind === "释义已修改").length;
  const mastered = diffs.filter((row) => row.kind === "当前已掌握").length;
  const unmastered = diffs.filter((row) => row.kind === "当前未掌握").length;
  const summary = document.createElement("p");
  summary.className = "version-diff-summary";
  summary.textContent = `当前新增 ${added} · 当前移除 ${removed} · 释义修改 ${modified} · 掌握变化 ${mastered + unmastered}`;
  versionPreviewListEl.appendChild(summary);

  diffs.forEach((row) => {
    const line = document.createElement("div");
    line.className = "version-diff-row";

    const kind = document.createElement("span");
    kind.className = "version-diff-kind";
    kind.textContent = row.kind;

    const word = document.createElement("span");
    word.className = "version-diff-word";
    word.textContent = row.word;

    const detail = document.createElement("span");
    detail.className = "version-diff-detail";
    detail.textContent = shortText(row.detail, 72);

    line.appendChild(kind);
    line.appendChild(word);
    line.appendChild(detail);
    versionPreviewListEl.appendChild(line);
  });
}

function formatVersionLabel(label) {
  const text = String(label || "manual");
  if (text.startsWith("upsert:")) return `修改 ${text.slice(7)}`;
  if (text.startsWith("delete:")) return `删除 ${text.slice(7)}`;
  if (text.startsWith("restore_base:")) return `恢复默认释义 ${text.slice(13)}`;
  if (text.startsWith("unhide:")) return `重新显示 ${text.slice(7)}`;
  if (text.startsWith("before_manual_sync_download:")) return "Chrome 同步前备份";
  if (text === "before_set_current") return "恢复版本前备份";
  if (text === "import_json") return "导入备份";
  return text === "manual" ? "手动变更" : text;
}

function renderVersions() {
  versionListEl.innerHTML = "";
  const latestRaw = backups.slice(0, 3);
  const list = latestThreeVersions();
  renderActiveVersionDisplay(list);
  viewLiveBtn.disabled = pageViewMode !== "version";

  if (list.length === 0) {
    versionSummaryEl.textContent = "暂无版本";
    selectedVersionId = null;
    pageViewMode = "live";
    renderVersionPreview([]);
    return;
  }

  const pinnedCurrent =
    currentVersionMode === "version" &&
    currentVersionId &&
    !latestRaw.some((item) => item.id === currentVersionId) &&
    list.some((item) => item.id === currentVersionId);
  versionSummaryEl.textContent = pinnedCurrent
    ? `已保存 ${backups.length} 个版本，展示最近 3 个（含当前使用版本）`
    : `已保存 ${backups.length} 个版本，展示最近 3 个`;

  if (!selectedVersionId || !list.some((item) => item.id === selectedVersionId)) {
    if (currentVersionMode === "version" && currentVersionId && list.some((item) => item.id === currentVersionId)) {
      selectedVersionId = currentVersionId;
    } else {
      selectedVersionId = list[0].id;
    }
  }

  for (const snapshot of list) {
    const isSelected = snapshot.id === selectedVersionId;
    const isPreviewing = pageViewMode === "version" && isSelected;
    const isCurrent = currentVersionMode === "version" && snapshot.id === currentVersionId;
    const item = document.createElement("article");
    item.className = `version-item${isPreviewing ? " active" : ""}${isCurrent ? " is-current" : ""}`;
    item.addEventListener("click", () => {
      selectedVersionId = snapshot.id;
      pageViewMode = "version";
      renderAll();
    });

    const head = document.createElement("div");
    head.className = "version-item-head";

    const title = document.createElement("p");
    title.className = "time";
    title.textContent = formatTime(snapshot.at);
    head.appendChild(title);

    if (isCurrent || isPreviewing) {
      const badges = document.createElement("div");
      badges.className = "version-badges";

      if (isCurrent) {
        const currentBadge = document.createElement("span");
        currentBadge.className = "version-badge version-badge-current";
        currentBadge.textContent = "当前使用";
        badges.appendChild(currentBadge);
      }

      if (isPreviewing) {
        const selectedBadge = document.createElement("span");
        selectedBadge.className = "version-badge version-badge-preview";
        selectedBadge.textContent = "预览中";
        badges.appendChild(selectedBadge);
      }

      head.appendChild(badges);
    }

    item.appendChild(head);

    const meta = document.createElement("p");
    meta.className = "meta";
    const customCount = Object.keys(snapshot.custom_vocab || {}).length;
    const deletedCount = Array.isArray(snapshot.deleted_vocab) ? snapshot.deleted_vocab.length : 0;
    const masteredCount = Array.isArray(snapshot.mastered_list) ? snapshot.mastered_list.length : 0;
    meta.textContent = `${customCount} 个自己添加或修改 | ${deletedCount} 个已隐藏 | ${masteredCount} 个已掌握`;
    item.appendChild(meta);

    const label = document.createElement("p");
    label.className = "label";
    label.textContent = formatVersionLabel(snapshot.label);
    item.appendChild(label);

    versionListEl.appendChild(item);
  }

  renderVersionPreview(list);
}

function renderSummary(viewState) {
  const customCount = Object.keys(viewState.custom || {}).length;
  const activeCount = rows.length;
  const hiddenCount = viewState.deleted.size;
  const viewPrefix =
    viewState.mode === "version" && viewState.snapshot
      ? `预览版本 ${formatTime(viewState.snapshot.at)} · `
      : "";
  summaryEl.textContent = `${viewPrefix}${activeCount} 个词 · ${customCount} 个自己添加或修改 · ${hiddenCount} 个已隐藏`;
}

function renderAll() {
  const viewState = getDisplayedVocabState();
  isReadOnlyView = viewState.mode === "version";
  mergeRows(viewState.custom, viewState.deleted);
  renderViewContext(viewState);
  renderEditorReadonlyState(viewState);
  renderSummary(viewState);
  renderTable();
  renderWeeklyTop(viewState.effective);
  renderVersions();
  if (!drawerLayerEl.hidden && selectedWord) {
    renderWordDrawer();
  }
}

function getWordRow(word) {
  return rows.find((row) => row.word === word) || hiddenRowsForState(customVocab, deletedSet).find((row) => row.word === word) || null;
}

function openDrawer() {
  drawerLayerEl.hidden = false;
}

function closeDrawer() {
  drawerLayerEl.hidden = true;
  selectedWord = null;
  editingWord = null;
  drawerMode = "detail";
  wordInput.value = "";
  defInput.value = "";
}

function renderWordDrawer() {
  if (drawerMode === "edit") {
    wordDetailViewEl.hidden = true;
    wordEditViewEl.hidden = false;
    drawerTitleEl.textContent = editingWord || "添加单词";
    editorTitleEl.textContent = editingWord ? `修改 ${editingWord}` : "添加单词";
    return;
  }

  const row = selectedWord ? getWordRow(selectedWord) : null;
  if (!row) {
    closeDrawer();
    return;
  }

  wordDetailViewEl.hidden = false;
  wordEditViewEl.hidden = true;
  drawerTitleEl.textContent = row.word;
  detailDefinitionEl.textContent = row.definition || "—";
  detailCountEl.textContent = `点读过 ${row.count || 0} 次`;
  const wordType = row.hasBase && row.hasCustom
    ? "修改过默认释义"
    : row.hasBase
      ? "默认词"
      : "自己添加";
  detailSourceEl.textContent = row.hidden ? `${wordType} · 已隐藏` : wordType;

  editDetailBtn.hidden = Boolean(row.hidden);
  editDetailBtn.textContent = "修改";
  restoreBaselineBtn.hidden = row.hidden || !(row.hasBase && row.hasCustom);
  unhideWordBtn.hidden = !row.hidden;
  hideWordBtn.hidden = row.hidden || !row.hasBase;
  deleteWordBtn.hidden = row.hidden || row.hasBase;
}

function openWordDetail(word) {
  const row = getWordRow(word);
  if (!row) return;
  selectedWord = word;
  editingWord = null;
  drawerMode = "detail";
  renderWordDrawer();
  openDrawer();
}

function startAdd() {
  if (!ensureLiveEditable()) return;
  selectedWord = null;
  editingWord = null;
  drawerMode = "edit";
  wordInput.value = "";
  defInput.value = "";
  renderWordDrawer();
  openDrawer();
  wordInput.focus();
}

function resetForm() {
  editingWord = null;
  wordInput.value = "";
  defInput.value = "";
  if (selectedWord && getWordRow(selectedWord)) {
    drawerMode = "detail";
    renderWordDrawer();
    return;
  }
  closeDrawer();
}

function startEdit(word, definition) {
  if (pageViewMode === "version") {
    setStatus("当前在版本预览模式，请先切回实时词库再编辑", true);
    return;
  }
  selectedWord = word;
  editingWord = word;
  drawerMode = "edit";
  wordInput.value = word;
  defInput.value = definition;
  renderWordDrawer();
  openDrawer();
  wordInput.focus();
}

function ensureLiveEditable() {
  if (pageViewMode !== "version") return true;
  setStatus("当前在版本预览模式，请先点“切回实时词库”再编辑", true);
  return false;
}

function saveState(nextCustom, nextDeleted, label, nextMastered = masteredSet) {
  const cleanCustom = sanitizeWordMap(nextCustom);
  const cleanDeleted = sanitizeWordList(Array.from(nextDeleted || []));
  const cleanMastered = sanitizeWordList(Array.from(nextMastered || []));

  for (const w of Object.keys(cleanCustom)) {
    const idx = cleanDeleted.indexOf(w);
    if (idx >= 0) cleanDeleted.splice(idx, 1);
  }

  const snapshot = {
    id: makeId(),
    at: new Date().toISOString(),
    label: label || "manual",
    custom_vocab: sanitizeWordMap(customVocab),
    deleted_vocab: sanitizeWordList(Array.from(deletedSet)),
    mastered_list: sanitizeWordList(Array.from(masteredSet)),
  };

  const nextBackups = [snapshot, ...backups].slice(0, MAX_BACKUPS);
  chrome.storage.local.set(
    {
      custom_vocab: cleanCustom,
      deleted_vocab: cleanDeleted,
      mastered_list: cleanMastered,
      vocab_backups: nextBackups,
      current_vocab_version_id: null,
      current_vocab_mode: "live",
      vocab_sync_updated_at: new Date().toISOString(),
    },
    () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        setStatus(`保存失败: ${lastErr.message}`, true);
        return;
      }
      customVocab = cleanCustom;
      deletedSet = new Set(cleanDeleted);
      masteredSet = new Set(cleanMastered);
      backups = nextBackups;
      currentVersionId = null;
      currentVersionMode = "live";
      pageViewMode = "live";
      renderAll();
      setStatus(`已保存 (${label || "manual"})`);
    }
  );
}

function saveFromForm(evt) {
  evt.preventDefault();
  if (!ensureLiveEditable()) return;

  const key = normalizeWord(wordInput.value);
  const def = defInput.value.trim();

  if (!key) {
    setStatus("单词格式不正确，只支持英文字母开头", true);
    return;
  }
  if (!def) {
    setStatus("释义不能为空", true);
    return;
  }

  const nextCustom = { ...customVocab, [key]: def };
  if (editingWord && editingWord !== key) {
    delete nextCustom[editingWord];
  }

  const nextDeleted = new Set(deletedSet);
  nextDeleted.delete(key);
  saveState(nextCustom, nextDeleted, `upsert:${key}`);
  resetForm();
}

function removeWord(word) {
  if (!ensureLiveEditable()) return;
  const hasBase = Object.prototype.hasOwnProperty.call(baseVocab, word);
  const tip = hasBase
    ? `删除 ${word} 后会隐藏这个默认词，是否继续？`
    : `确定删除自己添加的单词 ${word}？`;
  if (!window.confirm(tip)) return;

  const nextCustom = { ...customVocab };
  delete nextCustom[word];

  const nextDeleted = new Set(deletedSet);
  if (hasBase) nextDeleted.add(word);
  else nextDeleted.delete(word);

  saveState(nextCustom, nextDeleted, `delete:${word}`);
}

function restoreBaseline(word) {
  if (!ensureLiveEditable()) return;
  if (!window.confirm(`恢复 ${word} 的默认释义？`)) return;
  const nextCustom = { ...customVocab };
  delete nextCustom[word];

  const nextDeleted = new Set(deletedSet);
  nextDeleted.delete(word);
  saveState(nextCustom, nextDeleted, `restore_base:${word}`);
}

function unhideWord(word) {
  if (!ensureLiveEditable()) return;
  const nextDeleted = new Set(deletedSet);
  nextDeleted.delete(word);
  saveState({ ...customVocab }, nextDeleted, `unhide:${word}`);
}

function setCurrentVersion() {
  const snapshot = backups.find((item) => item.id === selectedVersionId);
  if (!snapshot) {
    setStatus("请选择有效版本", true);
    return;
  }

  if (currentVersionMode === "version" && currentVersionId === snapshot.id) {
    setStatus("当前已经在使用这个版本");
    return;
  }

  if (!window.confirm(`将 ${formatTime(snapshot.at)} 设为当前词库版本？词库和“已掌握”状态都会恢复。`)) return;

  const currentSnapshot = {
    id: makeId(),
    at: new Date().toISOString(),
    label: "before_set_current",
    custom_vocab: sanitizeWordMap(customVocab),
    deleted_vocab: sanitizeWordList(Array.from(deletedSet)),
    mastered_list: sanitizeWordList(Array.from(masteredSet)),
  };

  const nextBackups = [currentSnapshot, ...backups].slice(0, MAX_BACKUPS);
  const restoredCustom = sanitizeWordMap(snapshot.custom_vocab);
  const restoredDeleted = sanitizeWordList(snapshot.deleted_vocab);
  const restoredMastered = sanitizeWordList(snapshot.mastered_list);

  chrome.storage.local.set(
    {
      custom_vocab: restoredCustom,
      deleted_vocab: restoredDeleted,
      mastered_list: restoredMastered,
      vocab_backups: nextBackups,
      current_vocab_version_id: snapshot.id,
      current_vocab_mode: "version",
      vocab_sync_updated_at: new Date().toISOString(),
    },
    () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        setStatus(`设置版本失败: ${lastErr.message}`, true);
        return;
      }
      customVocab = restoredCustom;
      deletedSet = new Set(restoredDeleted);
      masteredSet = new Set(restoredMastered);
      backups = nextBackups;
      currentVersionId = snapshot.id;
      currentVersionMode = "version";
      selectedVersionId = snapshot.id;
      renderAll();
      setStatus(`已设置当前版本: ${formatTime(snapshot.at)}`);
    }
  );
}

function clearBackups() {
  if (!window.confirm("清空所有版本记录？此操作不可撤销。")) return;
  chrome.storage.local.set(
    {
      vocab_backups: [],
      current_vocab_version_id: null,
      current_vocab_mode: "live",
    },
    () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        setStatus(`清空失败: ${lastErr.message}`, true);
        return;
      }
      backups = [];
      currentVersionId = null;
      currentVersionMode = "live";
      selectedVersionId = null;
      pageViewMode = "live";
      renderAll();
      setStatus("已清空版本记录");
    }
  );
}

function switchToLiveView() {
  if (pageViewMode !== "version") return;
  pageViewMode = "live";
  resetForm();
  renderAll();
  setStatus("已切回实时词库");
}

function exportJson() {
  const payload = {
    exported_at: new Date().toISOString(),
    custom_vocab: sanitizeWordMap(customVocab),
    deleted_vocab: sanitizeWordList(Array.from(deletedSet)),
    mastered_list: sanitizeWordList(Array.from(masteredSet)),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `techwordlearn-vocab-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  maintenanceMenuEl.hidden = true;
  moreMenuBtn.setAttribute("aria-expanded", "false");
  setStatus("已导出备份");
}

function parseImportPayload(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("备份文件格式错误");
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "custom_vocab") ||
    Object.prototype.hasOwnProperty.call(obj, "deleted_vocab") ||
    Object.prototype.hasOwnProperty.call(obj, "mastered_list")
  ) {
    return {
      custom: sanitizeWordMap(obj.custom_vocab),
      deleted: sanitizeWordList(obj.deleted_vocab),
      mastered: sanitizeWordList(obj.mastered_list),
    };
  }

  return {
    custom: sanitizeWordMap(obj),
    deleted: [],
    mastered: [],
  };
}

function importJson(file) {
  if (!ensureLiveEditable()) return;
  const reader = new FileReader();
  reader.onerror = () => setStatus("读取文件失败", true);
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const incoming = parseImportPayload(parsed);

      if (!window.confirm("导入备份会和当前词库及“已掌握”状态合并，同名单词将被覆盖。继续？")) {
        return;
      }

      const nextCustom = { ...customVocab, ...incoming.custom };
      const nextDeleted = new Set([...deletedSet, ...incoming.deleted]);
      for (const word of Object.keys(incoming.custom)) {
        nextDeleted.delete(word);
      }
      const nextMastered = new Set([...masteredSet, ...incoming.mastered]);

      saveState(nextCustom, nextDeleted, "import_json", nextMastered);
    } catch (err) {
      setStatus(`导入失败: ${err.message}`, true);
    }
  };
  reader.readAsText(file, "utf-8");
}

function saveCloudSyncSettings() {
  const enabled = Boolean(cloudSyncEnabledInput.checked);
  const endpointRaw = cloudSyncEndpointInput.value.trim();
  const endpoint = endpointRaw ? sanitizeCloudEndpoint(endpointRaw) : "";
  const token = sanitizeCloudToken(cloudSyncTokenInput.value);

  if (enabled && !endpoint) {
    setStatus("启用自建服务器同步前，请先填写有效的 http/https 同步端点", true);
    return;
  }
  if (endpointRaw && !endpoint) {
    setStatus("同步端点格式不正确，只支持 http/https URL", true);
    return;
  }

  saveCloudSyncBtn.disabled = true;
  chrome.storage.local.set(
    {
      cloud_sync_enabled: enabled,
      cloud_sync_endpoint: endpoint,
      cloud_sync_token: token,
    },
    () => {
      saveCloudSyncBtn.disabled = false;
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        setStatus(`保存自建服务器同步设置失败: ${lastErr.message}`, true);
        return;
      }

      cloudSyncEnabled = enabled;
      cloudSyncEndpoint = endpoint;
      cloudSyncToken = token;
      renderCloudSyncPanel();
      setStatus(
        enabled
          ? "自建服务器同步设置已保存，可点击“立即同步”验证连接"
          : "已保存自建服务器同步设置（当前关闭）"
      );
    }
  );
}

function syncCloudNow() {
  if (!cloudSyncEnabledInput.checked) {
    setStatus("请先启用自建服务器同步", true);
    return;
  }

  const endpoint = sanitizeCloudEndpoint(cloudSyncEndpointInput.value);
  if (!endpoint) {
    setStatus("请先填写有效的同步端点", true);
    return;
  }

  syncCloudNowBtn.disabled = true;
  setStatus("正在执行自建服务器同步...");
  chrome.runtime.sendMessage({ action: "sync_cloud_now" }, (res) => {
    updateCloudSyncActionState();
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      setStatus(`自建服务器同步请求失败: ${lastErr.message}`, true);
      return;
    }

    if (!res || res.ok === false) {
      setStatus(`自建服务器同步失败: ${(res && res.error) || "unknown_error"}`, true);
      return;
    }

    if (res.skipped === "disabled") {
      setStatus("自建服务器同步未启用", true);
      return;
    }
    setStatus(
      res.changed ? "自建服务器同步完成，已合并最新词库" : "自建服务器同步完成，没有新增变更"
    );
  });
}

function loadStorage(showStatus = true) {
  chrome.storage.local.get(null, (items) => {
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      setStatus(`读取失败: ${lastErr.message}`, true);
      return;
    }

    customVocab = sanitizeWordMap(items.custom_vocab);
    wordCounts = extractWordCounts(items);
    weeklyWordCounts = sanitizeWeeklyWordCounts(items.weekly_word_counts);
    deletedSet = new Set(sanitizeWordList(items.deleted_vocab));
    masteredSet = new Set(sanitizeWordList(items.mastered_list));

    backups = Array.isArray(items.vocab_backups)
      ? items.vocab_backups
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : makeId(),
            at: typeof item.at === "string" ? item.at : new Date().toISOString(),
            label: typeof item.label === "string" ? item.label : "manual",
            custom_vocab: sanitizeWordMap(item.custom_vocab),
            deleted_vocab: sanitizeWordList(item.deleted_vocab),
            mastered_list: sanitizeWordList(item.mastered_list),
          }))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, MAX_BACKUPS)
      : [];

    const loadedVersionId =
      typeof items.current_vocab_version_id === "string" ? items.current_vocab_version_id : null;
    const loadedMode = items.current_vocab_mode === "version" ? "version" : "live";
    currentVersionMode = loadedMode === "version" && loadedVersionId ? "version" : "live";
    currentVersionId = currentVersionMode === "version" ? loadedVersionId : null;
    cloudSyncEnabled = Boolean(items.cloud_sync_enabled);
    cloudSyncEndpoint = typeof items.cloud_sync_endpoint === "string" ? items.cloud_sync_endpoint : "";
    cloudSyncToken = typeof items.cloud_sync_token === "string" ? items.cloud_sync_token : "";
    cloudSyncDeviceId = typeof items.cloud_sync_device_id === "string" ? items.cloud_sync_device_id : "";
    cloudSyncStatus = typeof items.cloud_sync_status === "string" ? items.cloud_sync_status : "idle";
    cloudSyncLastSyncedAt =
      typeof items.cloud_sync_last_synced_at === "string" ? items.cloud_sync_last_synced_at : "";
    cloudSyncLastError = typeof items.cloud_sync_last_error === "string" ? items.cloud_sync_last_error : "";
    cloudSyncLastReason = typeof items.cloud_sync_last_reason === "string" ? items.cloud_sync_last_reason : "";
    cloudSyncLastAttemptAt =
      typeof items.cloud_sync_last_attempt_at === "string" ? items.cloud_sync_last_attempt_at : "";

    if (pageViewMode === "version") {
      const stillExists = selectedVersionId && backups.some((item) => item.id === selectedVersionId);
      if (!stillExists) {
        pageViewMode = "live";
      }
    }

    renderAll();
    renderCloudSyncPanel();
    if (showStatus) statusEl.hidden = true;
  });
}

function loadBase() {
  return fetch(chrome.runtime.getURL("vocabulary.json"))
    .then((r) => r.json())
    .then((json) => {
      baseVocab = sanitizeWordMap(json);
    })
    .catch(() => {
      baseVocab = {};
    });
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    currentFilter = searchInput.value.trim().toLowerCase();
    renderTable();
  });

  editForm.addEventListener("submit", saveFromForm);
  resetFormBtn.addEventListener("click", resetForm);
  document.getElementById("add-word-btn").addEventListener("click", startAdd);
  document.getElementById("close-drawer-btn").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
  moreMenuBtn.addEventListener("click", toggleMaintenanceMenu);
  document.getElementById("open-stats-view-btn").addEventListener("click", () => showView("stats"));
  document.getElementById("open-sync-view-btn").addEventListener("click", () => showView("sync"));
  document.getElementById("open-versions-view-btn").addEventListener("click", () => showView("versions"));
  document.getElementById("back-from-stats-btn").addEventListener("click", () => showView("main"));
  document.getElementById("back-from-sync-btn").addEventListener("click", () => showView("main"));
  document.getElementById("back-from-versions-btn").addEventListener("click", () => showView("main"));
  cloudSettingsToggleBtn.addEventListener("click", toggleCloudSettings);
  filterButtons.all.addEventListener("click", () => setSourceFilter("all"));
  filterButtons.custom.addEventListener("click", () => setSourceFilter("custom"));
  filterButtons.base.addEventListener("click", () => setSourceFilter("base"));
  filterButtons.hidden.addEventListener("click", () => setSourceFilter("hidden"));
  editDetailBtn.addEventListener("click", () => {
    const row = selectedWord ? getWordRow(selectedWord) : null;
    if (row && !row.hidden) startEdit(row.word, row.definition);
  });
  restoreBaselineBtn.addEventListener("click", () => {
    if (selectedWord) restoreBaseline(selectedWord);
  });
  unhideWordBtn.addEventListener("click", () => {
    if (selectedWord) unhideWord(selectedWord);
  });
  hideWordBtn.addEventListener("click", () => {
    if (selectedWord) removeWord(selectedWord);
  });
  deleteWordBtn.addEventListener("click", () => {
    if (selectedWord) removeWord(selectedWord);
  });
  document.getElementById("export-btn").addEventListener("click", exportJson);
  document.getElementById("clear-backups-btn").addEventListener("click", clearBackups);
  setCurrentVersionBtn.addEventListener("click", setCurrentVersion);
  viewLiveBtn.addEventListener("click", switchToLiveView);
  saveCloudSyncBtn.addEventListener("click", saveCloudSyncSettings);
  syncCloudNowBtn.addEventListener("click", syncCloudNow);
  checkManualSyncBtn.addEventListener("click", checkManualSyncStatus);
  uploadManualSyncBtn.addEventListener("click", uploadManualSnapshot);
  downloadManualSyncBtn.addEventListener("click", downloadManualSnapshot);
  cloudSyncEnabledInput.addEventListener("change", updateCloudSyncActionState);
  cloudSyncEndpointInput.addEventListener("input", updateCloudSyncActionState);

  document.getElementById("import-input").addEventListener("change", (evt) => {
    maintenanceMenuEl.hidden = true;
    moreMenuBtn.setAttribute("aria-expanded", "false");
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    importJson(file);
    evt.target.value = "";
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.custom_vocab || changes.deleted_vocab || changes.mastered_list) {
      manualSyncContext = null;
      hideManualSyncActions();
      manualSyncSummaryEl.textContent = "本机词库或掌握状态已变化，请点击“检查 Chrome 同步”。";
    }

    const hasCountChange = Object.entries(changes).some(([key, diff]) => {
      const normalized = normalizeWord(key);
      if (!normalized || normalized !== key) return false;
      if (typeof diff.newValue === "number" && Number.isFinite(diff.newValue)) return true;
      if (typeof diff.oldValue === "number" && Number.isFinite(diff.oldValue)) return true;
      return false;
    });

    if (
      changes.custom_vocab ||
      changes.deleted_vocab ||
      changes.mastered_list ||
      changes.vocab_backups ||
      changes.current_vocab_version_id ||
      changes.current_vocab_mode ||
      changes.weekly_word_counts ||
      changes.cloud_sync_enabled ||
      changes.cloud_sync_endpoint ||
      changes.cloud_sync_token ||
      changes.cloud_sync_device_id ||
      changes.cloud_sync_status ||
      changes.cloud_sync_last_synced_at ||
      changes.cloud_sync_last_error ||
      changes.cloud_sync_last_reason ||
      changes.cloud_sync_last_attempt_at ||
      hasCountChange
    ) {
      loadStorage(false);
    }
  });
}

function init() {
  bindEvents();
  Promise.resolve()
    .then(loadBase)
    .then(() => loadStorage(true))
    .catch((err) => setStatus(`初始化失败: ${err.message}`, true));
}

init();
