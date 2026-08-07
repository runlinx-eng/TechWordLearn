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
  return { custom_vocab: custom, deleted_vocab: ["obsolete", "obsolete"] };
}

test("normalizes vocabulary deterministically", () => {
  assert.deepEqual(
    manualSync.normalizeState({
      custom_vocab: { API: "  application interface  ", "bad key": "ignored tail" },
      deleted_vocab: ["API", "Legacy", "legacy", ""],
    }),
    {
      custom_vocab: { api: "application interface", bad: "ignored tail" },
      deleted_vocab: ["legacy"],
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
    vocab_sync_updated_at: "2026-07-28T15:00:05Z",
  });
  assert.equal(decoded.kind, "legacy");
  assert.equal(decoded.revision, 0);
  assert.deepEqual(decoded.state, {
    custom_vocab: { kernel: "内核" },
    deleted_vocab: ["legacy"],
  });
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
