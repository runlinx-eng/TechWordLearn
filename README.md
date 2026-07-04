# TechWordLearn (Chrome Extension)

TechWordLearn 是一个技术英语沉浸学习扩展，支持：

- 页面单词高亮 + 悬浮释义
- 点击发音（`chrome.tts` + Web Speech 回退）
- 查询次数统计（总榜 + 周榜）
- 自定义词库管理（新增/编辑/删除/恢复）
- 词库版本快照（最近版本预览、设为当前版本）

## 目录结构

- `manifest.json`: 扩展清单
- `content.js`: 页面高亮、交互、计数与词库同步
- `background.js`: 右键菜单、TTS 消息中转、重注入
- `popup.html` / `popup.js`: 弹窗统计视图
- `options.html` / `options.js` / `options.css`: 词库管理页面
- `vocabulary.json`: 基线词库
- `scripts/vocab-version.js`: 周/月词库版本脚本
- `scripts/vocab-cloud-sync-server.py`: 云端词库同步服务示例
- `docs/vocabulary-versioning-workflow.md`: 版本管理流程文档
- `docs/cloud-vocab-sync.md`: 云同步接入说明

## 本地运行（给自己/他人）

1. 克隆仓库（或下载 zip 解压）。
2. 打开 Chrome: `chrome://extensions/`
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择项目根目录（本目录）。
5. 固定扩展图标，打开扩展弹窗或“词库管理”页面。

## 云端词库同步（跨设备 / 跨浏览器）

如果你要把词库放到公网统一同步，而不想被 `chrome.storage.sync` 的浏览器生态限制，可以：

1. 部署仓库里的 `scripts/vocab-cloud-sync-server.py`
2. 在“词库管理”页面填写云同步端点和 Bearer Token
3. 点击“立即同步”验证

详细步骤见：`docs/cloud-vocab-sync.md`

## Chrome + Atlas 自动词库同步（同机）

默认的 `chrome.storage.sync` 只在同一个浏览器生态内同步。
如果你希望 **Chrome 与 ChatGPT Atlas** 在同一台 Mac 上自动共享词库，请启动本地桥接服务：

```bash
# 启动并注册为 launchd 常驻服务
bash scripts/setup-vocab-sync-bridge.sh start

# 停止服务
bash scripts/setup-vocab-sync-bridge.sh stop
```

桥接服务会监听 `http://127.0.0.1:43110/sync`，扩展后台会定时把
`custom_vocab / deleted_vocab / vocab_sync_updated_at` 与桥接状态互相合并。

## 给别人分享（两种方式）

1. 分享 GitHub 仓库：
   - 对方 `git clone` 后按上面的“本地运行”步骤加载。
2. 分享发布包（zip）：
   - 运行 `bash scripts/package-extension.sh`
   - 生成文件在 `release/` 目录
   - 对方解压后通过“加载已解压的扩展程序”安装

## 词库与版本说明

- 基线词库文件：`vocabulary.json`
- 用户运行时词库：
  - 本地实时存储：`chrome.storage.local`
  - 跨设备词库同步：`chrome.storage.sync`（同步 `custom_vocab` / `deleted_vocab`）
  - 自建云端同步：配置后通过 HTTP `/sync` 接口合并 `custom_vocab` / `deleted_vocab`
  - `custom_vocab`
  - `deleted_vocab`
  - `vocab_backups`
  - `current_vocab_mode` / `current_vocab_version_id`
- 周/月快照目录：`vocab_versions/weekly/`、`vocab_versions/monthly/`

## 词库版本脚本

```bash
# 生成快照
node scripts/vocab-version.js snapshot --input <file> --cadence weekly|monthly --note <note>

# 对比两版
node scripts/vocab-version.js diff --from <file> --to <file>

# 发布某个版本到 vocabulary.json（可选备份）
node scripts/vocab-version.js promote --from <file> --backup
```

## 上传 GitHub 前检查

1. `node --check background.js content.js popup.js options.js`
2. 确认未提交本地临时文件：`git status --short`
3. 确认无敏感信息（token/key/password）
4. 提交后用全新 Chrome Profile 走一遍安装流程

## 许可证

本项目使用 MIT 许可证，详见 `LICENSE`。
