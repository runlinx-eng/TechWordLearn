(function initTechWordManualSync(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  root.TechWordManualSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  "use strict";

  const SCHEMA_VERSION = 2;
  const META_KEY = "twl_vocab_sync_meta";
  const CHUNK_KEY_PREFIX = "twl_vocab_sync_chunk_";
  const LEGACY_KEYS = ["custom_vocab", "deleted_vocab", "vocab_sync_updated_at"];
  const LOCAL_BASE_REVISION_KEY = "twl_manual_sync_base_revision";
  const LOCAL_BASE_FINGERPRINT_KEY = "twl_manual_sync_base_fingerprint";
  const LOCAL_DEVICE_ID_KEY = "twl_manual_sync_device_id";
  const LOCAL_LAST_SYNCED_AT_KEY = "twl_manual_sync_last_synced_at";
  const MAX_CHUNKS = 64;
  const MAX_CHUNK_VALUE_BYTES = 6800;
  const MAX_SNAPSHOT_STORAGE_BYTES = 45000;

  function normalizeWord(raw) {
    const match = String(raw || "").match(/[A-Za-z][A-Za-z'-]*/);
    return match ? match[0].toLowerCase() : null;
  }

  function sanitizeWordMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof key !== "string" || typeof value !== "string") continue;
      const word = normalizeWord(key);
      const definition = value.trim();
      if (!word || !definition) continue;
      out[word] = definition;
    }
    return out;
  }

  function sanitizeWordList(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      const word = normalizeWord(item);
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push(word);
    }
    return out;
  }

  function normalizeState(raw) {
    const custom = sanitizeWordMap(raw && raw.custom_vocab);
    const deleted = sanitizeWordList(raw && raw.deleted_vocab)
      .filter((word) => !Object.prototype.hasOwnProperty.call(custom, word))
      .sort();
    const sortedCustom = {};
    for (const word of Object.keys(custom).sort()) {
      sortedCustom[word] = custom[word];
    }
    return { custom_vocab: sortedCustom, deleted_vocab: deleted };
  }

  function stableStateJson(raw) {
    return JSON.stringify(normalizeState(raw));
  }

  function textEncoder() {
    if (typeof root.TextEncoder !== "function") {
      throw new Error("text_encoder_unavailable");
    }
    return new root.TextEncoder();
  }

  function utf8ByteLength(value) {
    return textEncoder().encode(String(value)).byteLength;
  }

  async function sha256Hex(value) {
    if (!root.crypto || !root.crypto.subtle || typeof root.crypto.subtle.digest !== "function") {
      throw new Error("sha256_unavailable");
    }
    const digest = await root.crypto.subtle.digest("SHA-256", textEncoder().encode(String(value)));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function stateFingerprint(raw) {
    return sha256Hex(stableStateJson(raw));
  }

  function splitForStorage(value, maxSerializedValueBytes = MAX_CHUNK_VALUE_BYTES) {
    const text = String(value);
    if (!text) return [""];
    if (!Number.isInteger(maxSerializedValueBytes) || maxSerializedValueBytes < 16) {
      throw new Error("invalid_chunk_size");
    }

    const chunks = [];
    let current = "";
    let serializedBytes = 2;
    for (const character of text) {
      const escaped = JSON.stringify(character).slice(1, -1);
      const characterBytes = utf8ByteLength(escaped);
      if (serializedBytes + characterBytes > maxSerializedValueBytes && current) {
        chunks.push(current);
        current = "";
        serializedBytes = 2;
      }
      if (serializedBytes + characterBytes > maxSerializedValueBytes) {
        throw new Error("character_exceeds_chunk_limit");
      }
      current += character;
      serializedBytes += characterBytes;
    }
    if (current || chunks.length === 0) chunks.push(current);
    return chunks;
  }

  function safeGenerationPart(raw, fallback) {
    const cleaned = String(raw || "")
      .replace(/[^A-Za-z0-9_-]+/g, "")
      .slice(0, 14);
    return cleaned || fallback;
  }

  function makeGeneration(revision, deviceId) {
    const rev = Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
    const device = safeGenerationPart(deviceId, "device");
    const nonce = Math.random().toString(36).slice(2, 10);
    return `r${String(rev).padStart(8, "0")}_${Date.now().toString(36)}_${device}_${nonce}`;
  }

  function chunkKey(generation, index) {
    return `${CHUNK_KEY_PREFIX}${generation}_${String(index).padStart(3, "0")}`;
  }

  function itemStorageBytes(key, value) {
    return utf8ByteLength(key) + utf8ByteLength(JSON.stringify(value));
  }

  function itemsStorageBytes(items) {
    return Object.entries(items || {}).reduce(
      (sum, [key, value]) => sum + itemStorageBytes(key, value),
      0
    );
  }

  async function buildSnapshot(rawState, options) {
    const opts = options || {};
    const revision = Number(opts.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error("invalid_revision");
    }
    const state = normalizeState(rawState);
    const payload = stableStateJson(state);
    const fingerprint = await sha256Hex(payload);
    const generation = safeGenerationPart(opts.generation, "") || makeGeneration(revision, opts.deviceId);
    const updatedAt =
      typeof opts.updatedAt === "string" && Number.isFinite(Date.parse(opts.updatedAt))
        ? opts.updatedAt
        : new Date().toISOString();
    const chunks = splitForStorage(payload);
    if (chunks.length > MAX_CHUNKS) throw new Error("snapshot_has_too_many_chunks");

    const chunkItems = {};
    chunks.forEach((chunk, index) => {
      chunkItems[chunkKey(generation, index)] = chunk;
    });
    const meta = {
      schema_version: SCHEMA_VERSION,
      revision,
      generation,
      chunk_count: chunks.length,
      content_sha256: fingerprint,
      updated_at: updatedAt,
      updated_by: safeGenerationPart(opts.deviceId, "unknown"),
      custom_count: Object.keys(state.custom_vocab).length,
      deleted_count: state.deleted_vocab.length,
    };
    const allItems = { ...chunkItems, [META_KEY]: meta };
    for (const [key, value] of Object.entries(allItems)) {
      if (itemStorageBytes(key, value) >= 8192) throw new Error("snapshot_item_exceeds_sync_quota");
    }
    if (itemsStorageBytes(allItems) > MAX_SNAPSHOT_STORAGE_BYTES) {
      throw new Error("snapshot_exceeds_safe_sync_capacity");
    }

    return { state, payload, fingerprint, generation, meta, chunkItems, allItems };
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function validateMeta(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("invalid_sync_meta");
    if (meta.schema_version !== SCHEMA_VERSION) throw new Error("unsupported_sync_schema");
    if (!Number.isSafeInteger(meta.revision) || meta.revision < 1) throw new Error("invalid_sync_revision");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(meta.generation || ""))) {
      throw new Error("invalid_sync_generation");
    }
    if (!Number.isInteger(meta.chunk_count) || meta.chunk_count < 1 || meta.chunk_count > MAX_CHUNKS) {
      throw new Error("invalid_sync_chunk_count");
    }
    if (!/^[a-f0-9]{64}$/.test(String(meta.content_sha256 || ""))) {
      throw new Error("invalid_sync_fingerprint");
    }
  }

  async function decodeSnapshot(storageItems) {
    const items = storageItems && typeof storageItems === "object" ? storageItems : {};
    if (!hasOwn(items, META_KEY)) {
      if (!LEGACY_KEYS.some((key) => hasOwn(items, key))) return null;
      const state = normalizeState(items);
      return {
        kind: "legacy",
        revision: 0,
        generation: "",
        updatedAt:
          typeof items.vocab_sync_updated_at === "string" &&
          Number.isFinite(Date.parse(items.vocab_sync_updated_at))
            ? items.vocab_sync_updated_at
            : "",
        state,
        fingerprint: await stateFingerprint(state),
        meta: null,
      };
    }

    const meta = items[META_KEY];
    validateMeta(meta);
    const chunks = [];
    for (let index = 0; index < meta.chunk_count; index += 1) {
      const key = chunkKey(meta.generation, index);
      if (typeof items[key] !== "string") throw new Error("sync_chunk_missing");
      chunks.push(items[key]);
    }
    const payload = chunks.join("");
    const fingerprint = await sha256Hex(payload);
    if (fingerprint !== meta.content_sha256) throw new Error("sync_snapshot_hash_mismatch");

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (_) {
      throw new Error("sync_snapshot_invalid_json");
    }
    const state = normalizeState(parsed);
    if (stableStateJson(state) !== payload) throw new Error("sync_snapshot_not_canonical");
    return {
      kind: "snapshot",
      revision: meta.revision,
      generation: meta.generation,
      updatedAt: typeof meta.updated_at === "string" ? meta.updated_at : "",
      state,
      fingerprint,
      meta,
    };
  }

  function classifyState(localFingerprint, remote, baseFingerprint) {
    if (!remote) return "remote_missing";
    if (localFingerprint === remote.fingerprint) return "in_sync";
    if (!baseFingerprint) return "conflict_unlinked";
    if (localFingerprint === baseFingerprint) return "remote_ahead";
    if (remote.fingerprint === baseFingerprint) return "local_ahead";
    return "conflict";
  }

  function staleManagedKeys(storageItems, keepGeneration) {
    const items = storageItems && typeof storageItems === "object" ? storageItems : {};
    const keepPrefix = keepGeneration ? `${CHUNK_KEY_PREFIX}${keepGeneration}_` : "";
    return Object.keys(items).filter((key) => {
      if (LEGACY_KEYS.includes(key)) return true;
      if (!key.startsWith(CHUNK_KEY_PREFIX)) return false;
      return !keepPrefix || !key.startsWith(keepPrefix);
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    META_KEY,
    CHUNK_KEY_PREFIX,
    LEGACY_KEYS: Object.freeze([...LEGACY_KEYS]),
    LOCAL_BASE_REVISION_KEY,
    LOCAL_BASE_FINGERPRINT_KEY,
    LOCAL_DEVICE_ID_KEY,
    LOCAL_LAST_SYNCED_AT_KEY,
    MAX_SNAPSHOT_STORAGE_BYTES,
    normalizeState,
    stableStateJson,
    utf8ByteLength,
    sha256Hex,
    stateFingerprint,
    splitForStorage,
    makeGeneration,
    chunkKey,
    itemStorageBytes,
    itemsStorageBytes,
    buildSnapshot,
    decodeSnapshot,
    classifyState,
    staleManagedKeys,
  });
});
