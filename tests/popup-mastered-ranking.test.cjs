const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

function loadPopupContext() {
  const context = vm.createContext({
    console,
    document: {
      addEventListener() {},
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "popup.js"), "utf8"), context, {
    filename: "popup.js",
  });
  return context;
}

test("popup ranking keeps counts but excludes words marked as mastered", () => {
  const context = loadPopupContext();
  const counts = {
    evidence: 3,
    domain: 2,
    approval: 1,
    provider: 1,
  };

  const before = context.rankWordCounts(counts, []);
  const after = context.rankWordCounts(counts, ["evidence"]);

  assert.deepEqual(JSON.parse(JSON.stringify(before.slice(0, 3))), [
    ["evidence", 3],
    ["domain", 2],
    ["approval", 1],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(after.slice(0, 3))), [
    ["domain", 2],
    ["approval", 1],
    ["provider", 1],
  ]);
  assert.equal(counts.evidence, 3);
});

test("popup ranking includes only active vocabulary and never exposes numeric metadata", () => {
  const context = loadPopupContext();
  const activeWords = context.buildActiveWordSet({
    custom_vocab: {
      domain: "域",
      approval: "批准",
      provider: "供应商",
    },
    deleted_vocab: ["provider"],
  });

  const ranked = context.rankWordCounts(
    {
      evidence: 9,
      domain: 2,
      approval: 2,
      provider: 8,
      deletedcustom: 7,
      twl_manual_sync_base_revision: 12,
    },
    ["evidence"],
    activeWords
  );

  assert.deepEqual(JSON.parse(JSON.stringify(ranked)), [
    ["approval", 2],
    ["domain", 2],
  ]);
});
