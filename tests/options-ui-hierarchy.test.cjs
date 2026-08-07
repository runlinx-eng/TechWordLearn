const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "options.html"), "utf8");
const css = fs.readFileSync(path.join(root, "options.css"), "utf8");
const js = fs.readFileSync(path.join(root, "options.js"), "utf8");

function section(id, nextId) {
  const start = html.indexOf(`id="${id}"`);
  const end = nextId ? html.indexOf(`id="${nextId}"`, start) : html.length;
  assert.ok(start >= 0, `missing #${id}`);
  assert.ok(end > start, `invalid boundary for #${id}`);
  return html.slice(start, end);
}

test("main vocabulary view exposes only dense browsing controls", () => {
  const main = section("main-view", "stats-view");
  assert.match(html, /id="summary"/);
  assert.match(html, /<header class="topbar">[\s\S]*?<h1>词库管理<\/h1>[\s\S]*?id="summary"[\s\S]*?id="topbar-actions"/);
  assert.match(main, /搜索单词……/);
  assert.match(main, />全部</);
  assert.match(main, />自定义</);
  assert.match(main, />基线</);
  assert.match(main, />隐藏</);
  assert.match(main, /查看统计&nbsp;›/);
  assert.doesNotMatch(main, /本周查询|weekly-query-total/);
  assert.equal((main.match(/class="vocab-column-header"/g) || []).length, 2);
  assert.equal((main.match(/<span>单词<\/span><span>查询<\/span><span>来源<\/span>/g) || []).length, 2);
  assert.doesNotMatch(main, /<span>释义<\/span>|<span>编辑<\/span>|<span>操作<\/span>/);
  assert.doesNotMatch(main, /服务器地址|Token|版本历史|导入备份|导出备份/);
  assert.match(css, /\.vocab-item-row\s*\{[\s\S]*?min-height:\s*39px;/);
  assert.match(css, /\.vocab-pair-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.vocab-item-row:nth-child\(2\)\s*\{[\s\S]*?border-left:\s*1px solid var\(--line-strong\);/);
  assert.match(css, /\.browse-tools\s*\{[\s\S]*?grid-template-columns:\s*minmax\(260px, 1fr\) auto auto;/);
  assert.match(css, /\.vocab-item-row:hover \.row-chevron,[\s\S]*?opacity:\s*0\.45;/);
  assert.match(js, /item\.className = "vocab-item-row";[\s\S]*?item\.addEventListener\("click", \(\) => openWordDetail\(row\.word\)\);/);
});

test("word meaning and mutation controls live in the second-level drawer", () => {
  const drawer = section("drawer-layer", null);
  assert.match(drawer, /id="detail-definition"/);
  assert.match(drawer, /id="detail-source"/);
  assert.match(drawer, /id="detail-count"/);
  assert.match(drawer, /id="edit-detail-btn"/);
  assert.match(drawer, /id="restore-baseline-btn"/);
  assert.match(drawer, /id="hide-word-btn"/);
  assert.match(drawer, /id="delete-word-btn"/);
  assert.match(drawer, /id="unhide-word-btn"/);
});

test("maintenance menu and sync page use user-facing concepts", () => {
  const menu = section("maintenance-menu", "main-view");
  const sync = section("sync-view", "versions-view");
  assert.match(menu, /多设备同步/);
  assert.match(menu, /版本历史/);
  assert.match(menu, /导入备份/);
  assert.match(menu, /导出备份/);
  assert.match(sync, /Chrome 多设备同步/);
  assert.match(sync, /检查 Chrome 同步/);
  assert.match(sync, /自建服务器同步/);
  assert.match(sync, /id="cloud-settings-panel"[^>]*hidden/);
  assert.doesNotMatch(html, />[^<]*导入 JSON[^<]*</);
  assert.doesNotMatch(html, />[^<]*导出 JSON[^<]*</);
});

test("UI refactor preserves existing weekly, history, and manual-sync boundaries", () => {
  assert.match(js, /const MAX_BACKUPS = 20;/);
  assert.match(js, /return `\$\{d\.getUTCFullYear\(\)\}-W\$\{String\(weekNo\)\.padStart\(2, "0"\)\}`;/);
  assert.match(js, /const latestRaw = backups\.slice\(0, 3\);/);
  assert.match(js, /rows = Object\.values\(merged\)\.sort\(\(a, b\) => b\.count - a\.count \|\| a\.word\.localeCompare\(b\.word\)\);/);
  assert.match(js, /checkManualSyncBtn\.addEventListener\("click", checkManualSyncStatus\);/);
  assert.match(js, /hideWordBtn\.hidden = row\.hidden \|\| !row\.hasBase;/);
  assert.match(js, /deleteWordBtn\.hidden = row\.hidden \|\| row\.hasBase;/);
});
