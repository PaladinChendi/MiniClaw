# Contributing

## Development Setup

```bash
git clone https://github.com/user/miniclaw.git
cd miniclaw
bun install
bun test
```

## Code Style

- Biome for lint + format (runs on CI)
- TypeScript strict mode
- Tab indentation, 120 char line width

## Pull Request Process

1. Fork → branch → PR
2. CI must pass: lint, typecheck, test (80% coverage gate)
3. Plugin API changes require contract test update
4. One PR per concern — don't bundle unrelated changes

## Plugin Development

See `docs/cc-to-miniclaw-mapping.md` for CC→MiniClaw concept mapping.
v1 does not support `miniclaw add` — plugins are built-in only.
