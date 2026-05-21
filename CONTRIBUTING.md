# Contributing

## Development Setup

```bash
git clone https://github.com/user/ebsclaw.git
cd ebsclaw
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

See `docs/cc-to-ebsclaw-mapping.md` for CC→ebsclaw concept mapping.
v1 does not support `ebsclaw add` — plugins are built-in only.
