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
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
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

function makeHarness() {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const localStore = {
    custom_vocab: { kernel: "内核", latency: "延迟" },
    deleted_vocab: [],
    vocab_backups: [],
  };
  const syncStore = {};
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
    fetch: async () => ({ json: async () => ({}) }),
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

test("profile sync remains untouched until the user invokes manual controls", async () => {
  const harness = makeHarness();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.syncCounters.get, 0);
  assert.equal(harness.syncCounters.set, 0);
  assert.deepEqual(harness.syncStore, {});

  harness.context.saveState({ kernel: "内核（已编辑）", latency: "延迟" }, new Set(), "fixture_edit");
  assert.match(harness.localStore.vocab_sync_updated_at, /^\d{4}-\d{2}-\d{2}T/);
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
  assert.match(harness.syncStore.twl_vocab_sync_meta.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(harness.localStore.twl_manual_sync_base_revision, 1);
  assert.equal(harness.runtimeCounters.sendMessage, 0);
  assert.match(harness.elements.get("status").textContent, /手动上传完成/);
});
