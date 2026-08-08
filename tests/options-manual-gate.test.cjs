const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.style = {};
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = id === "upload-manual-sync-btn" || id === "download-manual-sync-btn";
    this.files = [];
    this.listeners = new Map();
    this.attributes = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML === "") this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  remove() {}
  click() {}
  focus() {}
}

function selectKeys(store, keys) {
  if (keys === null || typeof keys === "undefined") return { ...store };
  if (typeof keys === "string") return { [keys]: store[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.filter((key) => Object.hasOwn(store, key)).map((key) => [key, store[key]]));
  }
  if (keys && typeof keys === "object") {
    const out = { ...keys };
    for (const key of Object.keys(keys)) {
      if (Object.hasOwn(store, key)) out[key] = store[key];
    }
    return out;
  }
  return {};
}

function fakeStorageArea(store, counters) {
  return {
    QUOTA_BYTES: 102400,
    get(keys, callback) {
      counters.get += 1;
      callback(selectKeys(store, keys));
    },
    set(payload, callback) {
      counters.set += 1;
      Object.assign(store, payload);
      callback();
    },
    remove(keys, callback) {
      counters.remove += 1;
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      callback();
    },
    getBytesInUse(_keys, callback) {
      callback(Buffer.byteLength(JSON.stringify(store), "utf8"));
    },
  };
}

function makeHarness({ baseFixture = {}, localFixture = {}, syncFixture = {} } = {}) {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const localStore = {
    custom_vocab: { kernel: "内核", latency: "延迟" },
    deleted_vocab: [],
    mastered_list: ["evidence"],
    vocab_backups: [],
    ...localFixture,
  };
  const syncStore = { ...syncFixture };
  const localCounters = { get: 0, set: 0, remove: 0 };
  const syncCounters = { get: 0, set: 0, remove: 0 };
  const runtimeCounters = { sendMessage: 0 };

  const context = vm.createContext({
    Blob,
    Buffer,
    Date,
    JSON,
    Math,
    Object,
    Promise,
    Set,
    TextEncoder,
    URL,
    clearTimeout,
    console,
    crypto: webcrypto,
    fetch: async () => ({ json: async () => ({ ...baseFixture }) }),
    setTimeout,
    document: {
      body: new FakeElement("body"),
      getElementById: getElement,
      createElement: () => new FakeElement(),
    },
    chrome: {
      runtime: {
        lastError: null,
        getURL: (relativePath) => `chrome-extension://fixture/${relativePath}`,
        sendMessage(_message, callback) {
          runtimeCounters.sendMessage += 1;
          callback({ ok: true, changed: false });
        },
      },
      storage: {
        local: fakeStorageArea(localStore, localCounters),
        sync: fakeStorageArea(syncStore, syncCounters),
        onChanged: { addListener() {} },
      },
    },
  });
  context.window = context;
  context.window.confirm = () => true;

  vm.runInContext(fs.readFileSync(path.join(root, "manual-sync.js"), "utf8"), context, {
    filename: "manual-sync.js",
  });
  vm.runInContext(fs.readFileSync(path.join(root, "options.js"), "utf8"), context, {
    filename: "options.js",
  });

  return {
    context,
    elements,
    localStore,
    syncStore,
    localCounters,
    syncCounters,
    runtimeCounters,
  };
}

async function schemaTwoFixture(state, revision = 4) {
  const payload = JSON.stringify(state);
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const generation = "schema-two-options";
  return {
    [`twl_vocab_sync_chunk_${generation}_000`]: payload,
    twl_vocab_sync_meta: {
      schema_version: 2,
      revision,
      generation,
      chunk_count: 1,
      content_sha256: fingerprint,
      updated_at: "2026-08-07T00:00:00.000Z",
      updated_by: "old-device",
      custom_count: Object.keys(state.custom_vocab).length,
      deleted_count: state.deleted_vocab.length,
    },
  };
}

test("profile sync remains untouched until the user invokes manual controls", async () => {
  const harness = makeHarness();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.syncCounters.get, 0);
  assert.equal(harness.syncCounters.set, 0);
  assert.deepEqual(harness.syncStore, {});

  harness.context.saveState({ kernel: "内核（已编辑）", latency: "延迟" }, new Set(), "fixture_edit");
  assert.match(harness.localStore.vocab_sync_updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.localStore.mastered_list)), ["evidence"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.localStore.vocab_backups[0].mastered_list)),
    ["evidence"]
  );
  assert.equal(harness.syncCounters.get, 0);
  assert.equal(harness.syncCounters.set, 0);

  await harness.context.checkManualSyncStatus();
  assert.ok(harness.syncCounters.get > 0);
  assert.equal(harness.syncCounters.set, 0);
  assert.equal(harness.elements.get("upload-manual-sync-btn").hidden, false);
  assert.match(harness.elements.get("manual-sync-summary").textContent, /尚无快照/);

  await harness.context.uploadManualSnapshot();
  assert.ok(harness.syncCounters.set >= 2);
  assert.equal(harness.syncStore.twl_vocab_sync_meta.revision, 1);
  assert.equal(harness.syncStore.twl_vocab_sync_meta.schema_version, 3);
  assert.equal(harness.syncStore.twl_vocab_sync_meta.mastered_count, 1);
  assert.match(harness.syncStore.twl_vocab_sync_meta.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(harness.localStore.twl_manual_sync_base_revision, 1);
  assert.equal(harness.runtimeCounters.sendMessage, 0);
  assert.match(harness.elements.get("status").textContent, /手动上传完成/);

  const uploaded = await harness.context.TechWordManualSync.decodeSnapshot(harness.syncStore);
  assert.deepEqual(Array.from(uploaded.state.mastered_list), ["evidence"]);
});

test("backup parsing, version snapshots, and restores carry mastered state", async () => {
  const historicalId = "history-mastered";
  const legacyId = "history-without-mastered";
  const harness = makeHarness({
    localFixture: {
      mastered_list: ["evidence"],
      vocab_backups: [
        {
          id: historicalId,
          at: "2026-08-01T00:00:00.000Z",
          label: "manual",
          custom_vocab: { kernel: "内核" },
          deleted_vocab: ["scope"],
          mastered_list: ["routing"],
        },
        {
          id: legacyId,
          at: "2026-07-01T00:00:00.000Z",
          label: "manual",
          custom_vocab: { kernel: "旧内核" },
          deleted_vocab: [],
        },
      ],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        harness.context.parseImportPayload({
          custom_vocab: {},
          deleted_vocab: [],
          mastered_list: ["Domain", "domain"],
        })
      )
    ),
    { custom: {}, deleted: [], mastered: ["domain"] }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.context.parseImportPayload({ custom_vocab: {} }))),
    { custom: {}, deleted: [], mastered: [] }
  );

  harness.context.saveState(
    { kernel: "内核（已编辑）" },
    new Set(),
    "fixture_mastered",
    new Set(["domain"])
  );
  assert.deepEqual(JSON.parse(JSON.stringify(harness.localStore.mastered_list)), ["domain"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.localStore.vocab_backups[0].mastered_list)),
    ["evidence"]
  );

  vm.runInContext(`selectedVersionId = ${JSON.stringify(historicalId)}`, harness.context);
  harness.context.setCurrentVersion();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.localStore.mastered_list)), ["routing"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.localStore.vocab_backups[0].mastered_list)),
    ["domain"]
  );

  vm.runInContext(`selectedVersionId = ${JSON.stringify(legacyId)}`, harness.context);
  harness.context.setCurrentVersion();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.localStore.mastered_list)), []);
});

test("schema 2 base hashes migrate without hiding a real two-sided conflict", async () => {
  const oldLocalState = {
    custom_vocab: { kernel: "内核" },
    deleted_vocab: [],
  };
  const oldLocalPayload = JSON.stringify(oldLocalState);
  const oldLocalDigest = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(oldLocalPayload)
  );
  const oldBaseFingerprint = Array.from(new Uint8Array(oldLocalDigest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const remoteState = {
    custom_vocab: { kernel: "内核", latency: "延迟" },
    deleted_vocab: [],
  };
  const harness = makeHarness({
    localFixture: {
      ...oldLocalState,
      mastered_list: ["evidence"],
      twl_manual_sync_base_fingerprint: oldBaseFingerprint,
      twl_manual_sync_base_revision: 3,
    },
    syncFixture: await schemaTwoFixture(remoteState, 4),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  await harness.context.checkManualSyncStatus();
  assert.match(harness.elements.get("manual-sync-summary").textContent, /两边都可能有变化/);
  assert.equal(harness.elements.get("upload-manual-sync-btn").hidden, false);
  assert.equal(harness.elements.get("download-manual-sync-btn").hidden, false);
});

test("manual Chrome download restores remote mastered state and backs up the local state", async () => {
  const harness = makeHarness({
    localFixture: {
      custom_vocab: { kernel: "内核" },
      deleted_vocab: [],
      mastered_list: ["evidence"],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const localState = harness.context.TechWordManualSync.normalizeState(harness.localStore);
  harness.localStore.twl_manual_sync_base_fingerprint =
    await harness.context.TechWordManualSync.stateFingerprint(localState);
  harness.localStore.twl_manual_sync_base_revision = 1;
  const remote = await harness.context.TechWordManualSync.buildSnapshot(
    {
      custom_vocab: { kernel: "内核", latency: "延迟" },
      deleted_vocab: ["scope"],
      mastered_list: ["routing"],
    },
    {
      revision: 2,
      deviceId: "remote-device",
      generation: "manual-download-fixture",
      updatedAt: "2026-08-08T00:00:00.000Z",
    }
  );
  Object.assign(harness.syncStore, remote.allItems);

  await harness.context.downloadManualSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.localStore.mastered_list)), ["routing"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.localStore.vocab_backups[0].mastered_list)),
    ["evidence"]
  );
  assert.equal(harness.localStore.twl_manual_sync_base_revision, 2);
});

test("dense list filters and detail drawer are read-only until an explicit action", async () => {
  const harness = makeHarness({
    baseFixture: {
      commit: "提交（保存代码快照）",
      kernel: "核心部分",
      scope: "范围",
    },
    localFixture: {
      custom_vocab: { kernel: "内核", latency: "延迟" },
      deleted_vocab: ["scope"],
      commit: 2,
      kernel: 2,
      latency: 5,
      scope: 9,
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const tbody = harness.elements.get("vocab-tbody");
  const renderedWords = () =>
    tbody.children.flatMap((pair) => pair.children.map((item) => item.children[0].textContent));
  assert.deepEqual(renderedWords(), ["latency", "commit", "kernel"]);
  assert.equal(
    harness.elements.get("summary").textContent,
    "3 个词 · 2 个自己添加或修改 · 1 个已隐藏"
  );

  const writesBeforeBrowsing = harness.localCounters.set;
  harness.context.setSourceFilter("custom");
  assert.deepEqual(renderedWords(), ["latency", "kernel"]);
  harness.context.setSourceFilter("base");
  assert.deepEqual(renderedWords(), ["commit"]);
  harness.context.setSourceFilter("hidden");
  assert.deepEqual(renderedWords(), ["scope"]);

  harness.context.openWordDetail("kernel");
  assert.equal(harness.elements.get("detail-source").textContent, "修改过默认释义");
  assert.equal(harness.elements.get("detail-count").textContent, "点读过 2 次");
  assert.equal(harness.elements.get("restore-baseline-btn").hidden, false);
  assert.equal(harness.elements.get("hide-word-btn").hidden, false);
  assert.equal(harness.elements.get("delete-word-btn").hidden, true);

  harness.context.openWordDetail("latency");
  assert.equal(harness.elements.get("detail-source").textContent, "自己添加");
  assert.equal(harness.elements.get("hide-word-btn").hidden, true);
  assert.equal(harness.elements.get("delete-word-btn").hidden, false);

  harness.context.openWordDetail("scope");
  assert.equal(harness.elements.get("detail-source").textContent, "默认词 · 已隐藏");
  assert.equal(harness.elements.get("edit-detail-btn").hidden, true);
  assert.equal(harness.elements.get("unhide-word-btn").hidden, false);
  assert.equal(harness.localCounters.set, writesBeforeBrowsing);
  assert.equal(harness.syncCounters.get, 0);
  assert.equal(harness.syncCounters.set, 0);
});
