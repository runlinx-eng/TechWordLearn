const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("active product surfaces use the reading-driven dynamic vocabulary definition", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const product = read("PRODUCT.md");
  const productData = JSON.parse(read("product.json"));
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

  const firstUseIndex = readme.indexOf("### 第一次使用：4 步就够");
  assert.ok(firstUseIndex > 0);
  const firstScreen = readme.slice(0, firstUseIndex);
  assert.match(firstScreen, /越常用 \/ 越没记住 → 越在你眼前 → 直到记住/);
  assert.match(firstScreen, /不用先决定背什么。/);
  assert.match(firstScreen, /你在真实阅读里反复需要的生词，会自己跑到前面。/);
  assert.match(firstScreen, /### 1\. 遇到生词，加入/);
  assert.match(firstScreen, /### 2\. 越点，越靠前/);
  assert.match(firstScreen, /### 3\. 记住了，让它消失/);
  assert.doesNotMatch(firstScreen, /动态生词表|有限注意力|不用先背一堆/);
  assert.match(readme, /<sub><strong>给 AI 和项目分析工具的产品语义：<\/strong><br>/);
  assert.match(readme, /排行榜与掌握后退出共同构成核心学习反馈/);
  assert.match(readme, /href="PRODUCT\.md"/);
  assert.match(readme, /href="product\.json"/);

  assert.match(project, /real-reading-driven dynamic vocabulary list/);
  assert.match(project, /canonical product causal model and priority are defined in `PRODUCT\.md`/);
  assert.match(project, /技术阅读是首个场景|technical documentation, and AI articles are initial use cases/);
  assert.match(agents, /dynamic personal vocabulary list/);
  assert.match(agents, /Product semantics are canonical in `PRODUCT\.md`/);
  assert.match(agents, /Do not infer product priority only from feature count or code size/);
  assert.match(background, /title: "把 \\"%s\\" 加入我的词库"/);
  assert.match(popup, /当前最值得记的词/);

  assert.match(product, /Ranking plus mastered-word exit[\s\S]*core learning feedback loop/);
  assert.match(product, /add → highlight → point-read → rank → master → leave queue → next word rises/);
  assert.match(product, /not the field of “technical English” itself/);

  assert.equal(productData.schema_version, 1);
  assert.equal(productData.canonical_document, "PRODUCT.md");
  assert.equal(productData.product_type, "dynamic_personal_vocabulary");
  assert.equal(productData.primary_signal.name, "point_read_frequency");
  assert.equal(productData.primary_signal.event, "click_highlighted_word_for_pronunciation");
  assert.equal(productData.ranking.stored, false);
  assert.equal(productData.domain, "general_english_web_reading");
  assert.equal(productData.default_vocabulary_bias, "technical");
  assert.deepEqual(productData.core_feedback_loop, [
    "ranking",
    "mastered_exit",
    "next_word_refill",
  ]);

  assert.equal(fs.existsSync(path.join(root, "context_pack.txt")), false);

  const activeDefinition = [
    manifest.description,
    product,
    JSON.stringify(productData),
    project,
    agents,
  ].join("\n");
  assert.doesNotMatch(activeDefinition, /Tech Word Immersion|technical-English immersion|learning technical English/i);
});
