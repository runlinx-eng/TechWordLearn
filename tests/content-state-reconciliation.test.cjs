const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content.js"), "utf8");

test("mastered and hidden state removes stale highlights across scan roots", () => {
  assert.match(
    source,
    /function removeInactiveHighlights[\s\S]*collectScanRoots\(\)[\s\S]*querySelectorAll\("\.tech-word-highlight"\)/
  );
  assert.match(
    source,
    /masteredWords\.add\(word\)[\s\S]*removeInactiveHighlights\(new Set\(\[word\]\)\)/
  );
  assert.match(
    source,
    /if \(shouldRescan\)[\s\S]*rebuildVocabulary\(\);[\s\S]*removeInactiveHighlights\(\);/
  );
});

test("extension-owned tooltip and highlight mutations do not trigger a full rescan", () => {
  assert.match(source, /function isExtensionOwnedMutationNode/);
  assert.match(source, /if \(isExtensionOwnedMutationNode\(m\.target\)\) continue;/);
  assert.match(source, /if \(isExtensionOwnedMutationNode\(added\)\) continue;/);
});

test("content scripts delegate count increments to the serialized background writer", () => {
  assert.match(source, /action: "increment_word_count", word/);
  assert.doesNotMatch(source, /safeStorageSet\(\{ \[word\]: newCount/);
  assert.match(source, /点读过 \$\{count\} 次/);
  assert.doesNotMatch(source, /\[Seen:/);
});

test("mastered changes update manual cloud-sync state and vocabulary snapshots retain mastery", () => {
  assert.match(
    source,
    /masteredWords\.add\(word\)[\s\S]*mastered_list: Array\.from\(masteredWords\),[\s\S]*vocab_sync_updated_at: new Date\(\)\.toISOString\(\)/
  );
  assert.match(
    source,
    /masteredWords\.add\(word\)[\s\S]*current_vocab_version_id: null,[\s\S]*current_vocab_mode: "live"/
  );
  assert.match(
    source,
    /safeStorageGet\(\["custom_vocab", "deleted_vocab", "mastered_list", "vocab_backups"\][\s\S]*mastered_list: currentMastered/
  );
});
