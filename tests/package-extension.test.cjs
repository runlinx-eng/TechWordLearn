const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

test("extension package contains only runtime files", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "techwordlearn-package-"));
  try {
    execFileSync("bash", [path.join(root, "scripts/package-extension.sh"), outputDir], {
      cwd: root,
      stdio: "pipe",
    });
    const archive = fs
      .readdirSync(outputDir)
      .find((name) => /^techwordlearn-v.+\.zip$/.test(name));
    assert.ok(archive, "package archive was not created");

    const entries = execFileSync("unzip", ["-Z1", path.join(outputDir, archive)], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .sort();

    assert.deepEqual(entries, [
      "LICENSE",
      "background.js",
      "content.js",
      "manifest.json",
      "manual-sync.js",
      "options.css",
      "options.html",
      "options.js",
      "popup.html",
      "popup.js",
      "styles.css",
      "vocabulary.json",
    ]);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
