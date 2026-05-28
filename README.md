# ebsclaw

AI agent platform that lives in your IM channels. Cross-session memory, skill workflows, 30+ channel plugins.

## Quick Start

```bash
bun install -g ebsclaw
ebsclaw tui
```

First run triggers a 2-step setup wizard:
1. **LLM Provider** — choose Anthropic/OpenAI/Google, paste API key
2. **Channel** — select QQ Bot (v1), others show "即将上线"
3. Gateway auto-starts — your bot is live in the IM channel

## Architecture

```
Gateway (Daemon) → Plugin API → Extensions (Channels/Memory/Skills/RAG)
                  → Agent Runtime → LLM Router → Providers
```

- **Plugin-First**: Channels, Memory, Skills, RAG are all plugins
- **Embedded Mode**: TUI reuses Gateway logic, no network layer
- **7-Level Compaction**: Progressive context management, v1 full delivery

## CLI

| Command | Description |
|---------|-------------|
| `ebsclaw tui` | Start TUI in Embedded mode (default) |
| `ebsclaw tui --mode gateway` | Start TUI in Gateway mode (v1.1) |
| `ebsclaw gateway start` | Start Gateway daemon |

## 本地开发

### 安装依赖

```bash
bun install
```

### 运行

```bash
# 启动交互式 TUI（默认嵌入式模式）
bun run packages/cli/src/index.ts tui

# 启动 Gateway 守护进程
bun run packages/cli/src/index.ts gateway start

# 查看帮助
bun run packages/cli/src/index.ts help
```

首次运行会自动启动 Setup Wizard，引导配置 provider 和 API key，配置保存在 `~/.ebsclaw/config.yaml`。

### 测试

```bash
# 跑全部测试
bun test

# 跑某个包的测试
bun test --cwd packages/agent-runtime
bun test --cwd extensions/memory

# 跑单个测试文件
bun test packages/agent-runtime/test/circuit-breaker.test.ts
```

### 代码检查

```bash
bun run lint        # Lint
bun run lint:fix    # Lint 自动修复
bun run typecheck   # 类型检查
```

## License

MIT
