# TechWordLearn 云端词库同步

这套云同步只同步扩展运行态词库：

- `custom_vocab`
- `deleted_vocab`
- `vocab_sync_updated_at`

它不会改动仓库里的基线 `vocabulary.json`，也不会同步 macOS App 的 SQLite 统计数据。

## 协议

扩展会向你配置的同步端点发送 `POST` 请求：

- URL: `https://your-domain.example/sync`
- Header:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>`（如果你配置了 token）
  - `X-TechWordLearn-Client: <device-id>`

请求体示例：

```json
{
  "custom_vocab": {
    "algorithm": "算法"
  },
  "deleted_vocab": [
    "latency"
  ],
  "vocab_sync_updated_at": "2026-03-07T10:22:11.000Z",
  "reason": "manual_request",
  "client": "twl_abc123"
}
```

服务端返回同样结构的 JSON 状态；仅在这次手动请求中，扩展会根据现有协议处理返回状态。此自托管协议与 Chrome 手动快照使用的 revision/hash 协议相互独立。

## 启动服务端

仓库已附带一个最小可部署服务：

```bash
export TWL_SYNC_TOKEN="换成一段足够长的随机字符串"
python3 scripts/vocab-cloud-sync-server.py \
  --host 0.0.0.0 \
  --port 8787 \
  --state-file /srv/techwordlearn/state.json
```

要点：

- 公网部署时不要用 `--allow-anonymous`
- 建议放到反向代理后面，并只暴露 HTTPS
- `state.json` 会保存最新词库状态，记得做磁盘持久化

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

查看当前云端状态：

```bash
curl \
  -H "Authorization: Bearer $TWL_SYNC_TOKEN" \
  http://127.0.0.1:8787/state
```

## 扩展侧配置

1. 打开扩展的“词库管理”页。
2. 在“云端同步”里勾选“启用”。
3. 填入你的 `/sync` 完整地址，例如 `https://sync.example.com/sync`。
4. 填入同一个 Bearer Token。
5. 点击“保存云同步配置”。
6. 点击“立即同步”验证。

保存配置本身不会发起同步。扩展不会在词库变化、浏览器启动、后台唤醒或定时器中调用端点；每次都必须由用户点击“立即同步”。

## 部署建议

这个服务端是纯 Python 标准库实现，适合先跑起来验证流程。后续如果你要迁到：

- Cloudflare Workers
- Supabase Edge Functions
- Railway / Render / Fly.io
- 自己的 VPS

只要保持 `/sync` 的输入输出协议一致，扩展端不需要改。
