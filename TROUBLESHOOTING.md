# Troubleshooting

## "API key 验证失败: 401 Unauthorized"
**Cause**: Invalid or missing API key.
**Fix**: Run `ebsclaw tui` → `/config` → LLM Provider → re-enter API key.
Or set environment variable: `export ANTHROPIC_API_KEY=sk-ant-...`

## "⚠ offline — 无 LLM 可用"
**Cause**: All LLM providers failing (429/5xx).
**Fix**: Check provider status. Switch provider: `/config` → LLM Provider.
Or add fallback provider in `~/.ebsclaw/config.yaml`.

## "上下文已满，请 /compact 手动压缩"
**Cause**: Context window exceeded and Compaction failed.
**Fix**: Type `/compact` to force manual compaction.
If repeated, try `/clear` to start a fresh session.

## "⚠ Plugin X crashed: reason"
**Cause**: Plugin threw uncaught exception.
**Fix**: Plugin is auto-disabled. Check logs at `~/.ebsclaw/logs/`.
Restart plugin: `/config` → Plugins → enable.

## "QQ Bot 连接失败: ECONNREFUSED"
**Cause**: QQ Bot API unreachable.
**Fix**: Verify network. Check QQ Bot App ID/Secret. Retry or skip (configure later via `/config`).

## "bun: command not found"
**Cause**: Bun not installed.
**Fix**: `curl -fsSL https://bun.sh/install | bash`
