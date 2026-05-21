# Claude Code → ebsclaw Concept Mapping

Per D42: All prompt templates must reference ebsclaw-native interfaces, not CC internals.

| CC Concept | ebsclaw Equivalent | Notes |
|------------|-------------------|-------|
| `runForkedAgent` | `spawnBackgroundTask(opts)` | Forked agent → background task runner |
| `skipTranscript` | `opts.silent = true` | Suppress transcript logging |
| prompt cache (shared) | `LLMRouter.request({ cacheHint: 'shared' })` | LLM Router handles caching transparently |
| `GrowthBook` / feature flags | `FeatureConfig.get(flagName)` | ebsclaw feature config (YAML-driven) |
| `hasMemoryWritesSince` | `consolidationLock.tryAcquire()` | Mutex for memory write dedup |
| `pendingContext` / trailing run | `ExtractQueue.enqueue(ctx)` | Queue with dedup and trailing runs |
| `stopHooks` | `LifecycleHooks.onQueryEnd` | Lifecycle event system |
| `postSamplingHook` | `LifecycleHooks.onResponseReady` | Post-sampling → post-response |
| `~/.claude/projects/<path>/memory/` | `~/.ebsclaw/memory/` | ebsclaw storage layout |
| `maxTurns` | `TaskBudget.maxIterations` | Execution budget model |
| `tengu_bramble_lintel` (GrowthBook) | `featureConfig.extractThrottleMs` | Throttle interval config |
| Agent loop | `AgentRunLoop.execute()` | Main agent execution loop |
| forked agent (streamCompactSummary) | `CompactRunner.runSummary()` | Dedicated compact runner |

## Prompt Template Parameterization Rules

1. Never reference `runForkedAgent` — use `spawnBackgroundTask`
2. Never reference `GrowthBook` — use `FeatureConfig`
3. Never reference CC-specific file paths — use `~/.ebsclaw/` base
4. Never reference `hasMemoryWritesSince` — use `consolidationLock`
5. All prompts must be testable against a `MockRuntime` interface
