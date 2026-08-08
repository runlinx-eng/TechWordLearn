const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "scripts", "vocab-cloud-sync-server.py");

function runPythonStateProbe() {
  const source = `
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("twl_cloud_sync", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

legacy = module.sanitize_state({
    "custom_vocab": {"Kernel": "内核"},
    "deleted_vocab": ["Scope"],
    "vocab_sync_updated_at": "2026-08-07T00:00:00Z",
})
merged = module.merge_equal_stamp(
    module.sanitize_state({"mastered_list": ["Evidence"]}),
    module.sanitize_state({"mastered_list": ["routing", "evidence"]}),
)
print(json.dumps({"legacy": legacy, "merged": merged}, ensure_ascii=False))
`;
  const result = spawnSync("python3", ["-c", source, serverPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("self-hosted server migrates old state and retains mastered words", () => {
  const result = runPythonStateProbe();
  assert.deepEqual(result.legacy.mastered_list, []);
  assert.deepEqual(result.merged.mastered_list, ["evidence", "routing"]);
  assert.match(result.merged.vocab_sync_updated_at, /^\d{4}-\d{2}-\d{2}T/);
});
