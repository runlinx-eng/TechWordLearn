const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

test("background worker contains no profile-sync, bridge, or alarm path", () => {
  const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
  assert.doesNotMatch(source, /chrome\.storage\.sync/);
  assert.doesNotMatch(source, /BRIDGE_|syncViaLocalBridge|reconcileVocabState|pushLocalToSync|pullSyncToLocal/);
  assert.doesNotMatch(source, /chrome\.alarms|alarm_poll|on_local_changed|on_sync_changed/);
  assert.equal((source.match(/syncViaCloud\(/g) || []).length, 2);
  assert.match(source, /req\.action === "sync_cloud_now"/);
  assert.match(source, /syncViaCloud\("manual_request"\)/);
});

test("manifest does not request alarm permission", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.ok(!manifest.permissions.includes("alarms"));
});

test("retired polling and loopback services are absent", () => {
  for (const relativePath of [
    "scripts/vocab-storage-sync-daemon.py",
    "scripts/setup-vocab-storage-sync.sh",
    "scripts/vocab-sync-bridge.py",
    "scripts/setup-vocab-sync-bridge.sh",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath);
  }
});
