const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

function makeStorageArea(store) {
  return {
    get(keys, callback) {
      setImmediate(() => {
        if (keys === null) {
          callback({ ...store });
          return;
        }
        const selected = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (Object.prototype.hasOwnProperty.call(store, key)) selected[key] = store[key];
        }
        callback(selected);
      });
    },
    set(payload, callback) {
      setImmediate(() => {
        Object.assign(store, payload);
        if (callback) callback();
      });
    },
  };
}

function loadBackgroundContext(initialLocal = {}, fetchImpl = async () => null) {
  const localStore = { ...initialLocal };
  const syncStore = {};
  const context = vm.createContext({
    AbortController,
    URL,
    clearTimeout,
    console,
    crypto: globalThis.crypto,
    fetch: fetchImpl,
    setTimeout,
    chrome: {
      storage: {
        local: makeStorageArea(localStore),
        sync: makeStorageArea(syncStore),
        onChanged: { addListener() {} },
      },
      runtime: {
        id: "test-extension",
        lastError: null,
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener() {} },
      },
      tabs: {},
    },
  });

  vm.runInContext(backgroundSource, context, { filename: "background.js" });
  return { context, localStore };
}

test("point-reading updates are serialized so concurrent clicks are not lost", async () => {
  const { context, localStore } = loadBackgroundContext();

  await Promise.all([
    context.enqueueWordCountIncrement("evidence"),
    context.enqueueWordCountIncrement("evidence"),
    context.enqueueWordCountIncrement("domain"),
    context.enqueueWordCountIncrement("evidence"),
  ]);

  const weekKey = context.getCurrentWeekKey();
  assert.equal(localStore.evidence, 3);
  assert.equal(localStore.domain, 1);
  assert.equal(localStore.weekly_word_counts[weekKey].evidence, 3);
  assert.equal(localStore.weekly_word_counts[weekKey].domain, 1);
});

test("routine navigation no longer reinjects or writes successful injection diagnostics", () => {
  assert.doesNotMatch(backgroundSource, /chrome\.tabs\.onActivated/);
  assert.doesNotMatch(backgroundSource, /chrome\.tabs\.onUpdated/);
  assert.doesNotMatch(backgroundSource, /recordInjectDiag\("(?:inject_start|css_ok|js_ok|skip_)/);
  assert.match(backgroundSource, /ensureContentInTab[\s\S]*action: "twl_ping"/);
  assert.match(backgroundSource, /recordInjectDiag\("css_error"/);
  assert.match(backgroundSource, /recordInjectDiag\("js_error"/);
});

test("self-hosted manual sync state includes mastered words without point-reading counts", () => {
  const { context } = loadBackgroundContext();
  const normalized = JSON.parse(
    JSON.stringify(
      context.normalizeVocabState({
        custom_vocab: { Provider: "供应商" },
        deleted_vocab: ["Scope", "scope"],
        mastered_list: ["Evidence", "routing", "evidence"],
        evidence: 55,
        weekly_word_counts: { "2026-W32": { evidence: 3 } },
      })
    )
  );
  assert.deepEqual(normalized, {
    custom_vocab: { provider: "供应商" },
    deleted_vocab: ["scope"],
    mastered_list: ["evidence", "routing"],
  });

  const merged = JSON.parse(
    JSON.stringify(
      context.mergeStatesPreferIncoming(
        { custom_vocab: {}, deleted_vocab: [], mastered_list: ["evidence"] },
        { custom_vocab: {}, deleted_vocab: [], mastered_list: ["routing"] }
      )
    )
  );
  assert.deepEqual(merged.mastered_list, ["evidence", "routing"]);
});

test("self-hosted manual sync sends and restores mastered state only on explicit request", async () => {
  let sentBody = null;
  const fetchImpl = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        custom_vocab: { kernel: "内核", latency: "延迟" },
        deleted_vocab: [],
        mastered_list: ["routing"],
        vocab_sync_updated_at: "2026-08-08T00:00:00.000Z",
      }),
    };
  };
  const { context, localStore } = loadBackgroundContext(
    {
      custom_vocab: { kernel: "内核" },
      deleted_vocab: [],
      mastered_list: ["evidence"],
      evidence: 55,
      weekly_word_counts: { "2026-W32": { evidence: 3 } },
      vocab_sync_updated_at: "2026-08-07T00:00:00.000Z",
      cloud_sync_enabled: true,
      cloud_sync_endpoint: "https://sync.example.test/sync",
      cloud_sync_device_id: "local-device",
    },
    fetchImpl
  );

  const result = await context.syncViaCloud("manual_request");
  assert.equal(result.ok, true);
  assert.deepEqual(sentBody.mastered_list, ["evidence"]);
  assert.equal(Object.hasOwn(sentBody, "evidence"), false);
  assert.equal(Object.hasOwn(sentBody, "weekly_word_counts"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(localStore.mastered_list)), ["routing"]);
});
