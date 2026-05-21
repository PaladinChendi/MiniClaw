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

## License

MIT
