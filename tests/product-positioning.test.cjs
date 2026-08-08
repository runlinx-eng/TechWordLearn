const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("active product surfaces use the reading-driven dynamic vocabulary definition", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const readme = read("README.md");
  const project = read("PROJECT.md");
  const agents = read("AGENTS.md");
  const background = read("background.js");
  const popup = read("popup.html");

  assert.equal(manifest.name, "TechWordLearn");
  assert.equal(
    manifest.description,
    "真实阅读驱动的动态生词表：把有限注意力持续给当前最值得记的词。"
  );

  assert.match(readme, /最实用的生词，会自己冒出来等我消灭。/);
  assert.match(readme, /真实阅读驱动的动态生词表。/);
  assert.match(readme, /把有限注意力持续给当前最值得记的词。/);
  assert.match(readme, /记住一个，下一批自然顶上来。/);

  assert.match(project, /real-reading-driven dynamic vocabulary list/);
  assert.match(project, /技术阅读是首个场景|technical documentation, and AI articles are initial use cases/);
  assert.match(agents, /dynamic personal vocabulary list/);
  assert.match(background, /title: "把 \\"%s\\" 加入我的词库"/);
  assert.match(popup, /当前最值得记的词/);

  const activeDefinition = [manifest.description, project, agents].join("\n");
  assert.doesNotMatch(activeDefinition, /Tech Word Immersion|technical-English immersion|learning technical English/i);
});
