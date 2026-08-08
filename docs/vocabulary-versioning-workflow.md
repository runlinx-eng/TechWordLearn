# 词库版本管理流程（周/月）

目标：把词库更新从“临时手工改”变成“可追溯、可对比、可回滚”的固定流程。

## 一、目录约定

- 正式词库：`vocabulary.json`
- 版本快照目录：
  - `vocab_versions/weekly/`
  - `vocab_versions/monthly/`
- 管理脚本：`scripts/vocab-version.js`

## 二、每周流程（推荐周五）

1. 在扩展“我的词库”页选择“···”→“导出备份”。备份文件为 JSON，包含 `custom_vocab` / `deleted_vocab` / `mastered_list`。
2. 将导出文件放到项目中，例如：`imports/weekly-export-YYYY-MM-DD.json`
3. 生成周快照：

```bash
node scripts/vocab-version.js snapshot \
  --input imports/weekly-export-2026-02-13.json \
  --cadence weekly \
  --note week-review
```

4. 与上一个周版本对比：

```bash
node scripts/vocab-version.js diff \
  --from vocab_versions/weekly/2026-W06-week-review.json \
  --to vocab_versions/weekly/2026-W07-week-review.json
```

5. 提交到 git（建议信息：`chore(vocab): weekly snapshot YYYY-Www`）。

## 三、每月流程（推荐月末）

1. 生成月快照：

```bash
node scripts/vocab-version.js snapshot \
  --input imports/monthly-export-2026-02-28.json \
  --cadence monthly \
  --note month-close
```

2. 检查变更：

```bash
node scripts/vocab-version.js diff \
  --from vocab_versions/monthly/2026-01-month-close.json \
  --to vocab_versions/monthly/2026-02-month-close.json
```

3. 确认后发布到正式词库（可自动备份旧文件）：

```bash
node scripts/vocab-version.js promote \
  --from vocab_versions/monthly/2026-02-month-close.json \
  --target vocabulary.json \
  --backup
```

4. 提交到 git（建议信息：`release(vocab): monthly 2026-02`）。

## 四、回滚流程

当词库异常时，直接把某个历史快照发布回 `vocabulary.json`：

```bash
node scripts/vocab-version.js promote \
  --from vocab_versions/weekly/2026-W05-week-review.json \
  --target vocabulary.json \
  --backup
```

然后重新加载扩展。

## 五、脚本支持的输入格式

`scripts/vocab-version.js` 支持三类输入：

1. 纯词典 JSON：`{"algorithm":"..."}`  
2. 扩展导出格式：`{"custom_vocab": {...}, "deleted_vocab": [...], "mastered_list": [...]}`（仓库词库脚本只提取词条内容，不把个人掌握状态发布到 `vocabulary.json`）
3. 本脚本生成的快照格式：`{"meta": {...}, "vocab": {...}}`

## 六、命令速查

```bash
# 生成快照
node scripts/vocab-version.js snapshot --input <file> --cadence weekly|monthly [--note text]

# 对比两版
node scripts/vocab-version.js diff --from <file> --to <file>

# 发布某版到 vocabulary.json
node scripts/vocab-version.js promote --from <file> [--target vocabulary.json] [--backup]
```
