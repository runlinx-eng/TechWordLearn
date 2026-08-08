const { webcrypto } = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const manualSync = require("../manual-sync.js");

function alphaId(index) {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(97 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

function makeState(count, definitionSize = 24) {
  const custom = {};
  for (let index = 0; index < count; index += 1) {
    custom[`term${alphaId(index)}`] = `定义 ${alphaId(index)} ${"技术语境".repeat(definitionSize)}`;
  }
  return {
    custom_vocab: custom,
    deleted_vocab: ["obsolete", "obsolete"],
    mastered_list: ["routing", "evidence", "routing"],
  };
}

test("normalizes vocabulary deterministically", () => {
  assert.deepEqual(
    manualSync.normalizeState({
      custom_vocab: { API: "  application interface  ", "bad key": "ignored tail" },
      deleted_vocab: ["API", "Legacy", "legacy", ""],
      mastered_list: ["Routing", "evidence", "routing"],
    }),
    {
      custom_vocab: { api: "application interface", bad: "ignored tail" },
      deleted_vocab: ["legacy"],
      mastered_list: ["evidence", "routing"],
    }
  );
});

test("splits strings without data loss and stays below the per-item safety ceiling", () => {
  const source = `${"中文🙂\"\\\n".repeat(1200)}end`;
  const chunks = manualSync.splitForStorage(source);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), source);
  for (const chunk of chunks) {
    assert.ok(manualSync.utf8ByteLength(JSON.stringify(chunk)) <= 6800);
  }
});

test("builds and decodes a multi-chunk snapshot with revision and hash validation", async () => {
  const state = makeState(174, 8);
  const built = await manualSync.buildSnapshot(state, {
    revision: 7,
    deviceId: "device-test",
    generation: "fixture-generation",
    updatedAt: "2026-08-07T00:00:00.000Z",
  });
  assert.ok(Object.keys(built.chunkItems).length > 1);
  assert.equal(built.meta.revision, 7);
  assert.equal(built.meta.schema_version, 3);
  assert.equal(built.meta.mastered_count, 2);
  assert.ok(manualSync.itemsStorageBytes(built.allItems) <= manualSync.MAX_SNAPSHOT_STORAGE_BYTES);
  for (const [key, value] of Object.entries(built.allItems)) {
    assert.ok(manualSync.itemStorageBytes(key, value) < 8192);
  }

  const decoded = await manualSync.decodeSnapshot(built.allItems);
  assert.equal(decoded.kind, "snapshot");
  assert.equal(decoded.revision, 7);
  assert.equal(decoded.fingerprint, built.fingerprint);
  assert.deepEqual(decoded.state, manualSync.normalizeState(state));
});

test("rejects a corrupted snapshot chunk", async () => {
  const built = await manualSync.buildSnapshot(makeState(20, 2), {
    revision: 1,
    deviceId: "device-test",
    generation: "corrupt-fixture",
  });
  const items = { ...built.allItems };
  const firstChunk = Object.keys(built.chunkItems)[0];
  items[firstChunk] = `${items[firstChunk]}x`;
  await assert.rejects(() => manualSync.decodeSnapshot(items), /sync_snapshot_hash_mismatch/);
});

test("reads the previous unchunked Chrome Sync format without mutating it", async () => {
  const decoded = await manualSync.decodeSnapshot({
    custom_vocab: { Kernel: "内核" },
    deleted_vocab: ["legacy"],
    mastered_list: ["Evidence"],
    vocab_sync_updated_at: "2026-07-28T15:00:05Z",
  });
  assert.equal(decoded.kind, "legacy");
  assert.equal(decoded.revision, 0);
  assert.deepEqual(decoded.state, {
    custom_vocab: { kernel: "内核" },
    deleted_vocab: ["legacy"],
    mastered_list: ["evidence"],
  });
});

test("decodes schema 2 snapshots as mastered-empty state and exposes a migration fingerprint", async () => {
  const payload = JSON.stringify({
    custom_vocab: { kernel: "内核" },
    deleted_vocab: ["legacy"],
  });
  const transportFingerprint = await manualSync.sha256Hex(payload);
  const generation = "schema-two-fixture";
  const items = {
    [manualSync.chunkKey(generation, 0)]: payload,
    [manualSync.META_KEY]: {
      schema_version: 2,
      revision: 9,
      generation,
      chunk_count: 1,
      content_sha256: transportFingerprint,
      updated_at: "2026-08-07T00:00:00.000Z",
      updated_by: "old-device",
      custom_count: 1,
      deleted_count: 1,
    },
  };

  const decoded = await manualSync.decodeSnapshot(items);
  assert.equal(decoded.schemaVersion, 2);
  assert.equal(decoded.transportFingerprint, transportFingerprint);
  assert.notEqual(decoded.fingerprint, transportFingerprint);
  assert.deepEqual(decoded.state, {
    custom_vocab: { kernel: "内核" },
    deleted_vocab: ["legacy"],
    mastered_list: [],
  });
  assert.equal(decoded.fingerprint, await manualSync.stateFingerprint(decoded.state));
});

test("classifies one-sided changes and conflicts from the saved base fingerprint", () => {
  const remote = { fingerprint: "remote" };
  assert.equal(manualSync.classifyState("local", null, ""), "remote_missing");
  assert.equal(manualSync.classifyState("same", { fingerprint: "same" }, ""), "in_sync");
  assert.equal(manualSync.classifyState("base", remote, "base"), "remote_ahead");
  assert.equal(manualSync.classifyState("local", { fingerprint: "base" }, "base"), "local_ahead");
  assert.equal(manualSync.classifyState("local", remote, "base"), "conflict");
  assert.equal(manualSync.classifyState("local", remote, ""), "conflict_unlinked");
});

test("rejects snapshots that cannot be updated atomically within the safe quota envelope", async () => {
  await assert.rejects(
    () =>
      manualSync.buildSnapshot(makeState(500, 18), {
        revision: 1,
        deviceId: "device-test",
      }),
    /snapshot_exceeds_safe_sync_capacity|snapshot_has_too_many_chunks/
  );
});
