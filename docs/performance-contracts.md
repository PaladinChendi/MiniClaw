# ebsclaw Performance Contracts

Per D8/D39: Three deployment tiers with distinct latency budgets.

## Latency Budgets

| Operation | Embedded (trusted) | Worker (untrusted) | Spawn (max isolation) |
|-----------|-------------------|--------------------|-----------------------|
| `callPlugin` | <10ms | <50ms | <100ms |
| `callLLM` (chat) | <500ms (TTFT) | <500ms (TTFT) | <500ms (TTFT) |
| Memory search | <500ms | <500ms | <500ms |
| Compaction (L1-L3) | <100ms | <100ms | <100ms |
| Compaction (L4-L7) | excluded from budget | excluded | excluded |
| Session save | <50ms | <50ms | <50ms |

## Compaction Budget Exclusion

Per Eng Review Run 1 C1: First-token budget excludes Compaction time.
When L4+ Compaction triggers, TUI shows progress indicator.
Budget resumes after Compaction completes: "TTFT post-compact <2s".

## Embed Queue Priority

Per D43: LLM Router embed endpoint serves requests with priority:
1. Session chat (highest) — interactive, user waiting
2. Memory semantic search — cron-triggered, can queue
3. RAG indexing — lazy-triggered, can queue longer

## Measurement

- Phase 1 E2E: QQbot hot path (first token <2s, memory search <500ms)
- Phase 2: Compaction L1-L3 latency (<100ms)
- Phase 3: Session persistence (<50ms)
- Phase 3: Concurrent 10+ session stress test
