# Phase 2: Agent Runtime + Compaction Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Runtime with core loop, LLM Router, Tool Execution, Streaming, and all 7 Compaction mechanisms — enabling autonomous agent conversations with progressive context management.

**Architecture:** Agent Runtime is a class owned by Gateway. It runs the agentic loop (prompt→LLM→tool→reply). LLM Router sits in the Providers layer as unified entry for chat+embed with fallback chains. Compaction Pipeline is a linear 7-level progressive system — each level only activates if the previous failed to resolve token overflow. Compaction is NOT a plugin; it's AR core with Memory decoupled via event hooks.

**Tech Stack:** TypeScript 5.x, Bun 1.3+, bun test, biome, @anthropic-ai/sdk (provider), openai (provider)

---

## File Structure

```
packages/agent-runtime/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  — AgentRuntime class, main loop
│   ├── types.ts                  — Internal AR types
│   ├── prompt-assembly.ts        — System prompt + memory injection + tool descriptions
│   ├── tool-execution.ts         — Tool registry + execution engine
│   ├── tools/
│   │   ├── bash.ts               — read-only bash by default
│   │   ├── read-file.ts
│   │   ├── list-files.ts
│   │   └── spawn-sub-agent.ts
│   ├── streaming-engine.ts       — SSE/chunked response with sentence boundary
│   ├── circuit-breaker.ts        — Half-open CB implementation
│   ├── compaction/
│   │   ├── index.ts              — CompactionPipeline orchestrator
│   │   ├── types.ts              — Compaction shared types
│   │   ├── tool-result-budget.ts — L1
│   │   ├── time-microcompact.ts  — L2
│   │   ├── cached-microcompact.ts— L3
│   │   ├── history-snip.ts       — L4
│   │   ├── context-collapse.ts   — L5 (Stage/Arm/Commit + projectView)
│   │   ├── sm-compact.ts         — L6 (LLM summary + Memory hook)
│   │   └── legacy-compact.ts     — L7 (full conversation summary)
│   └── llm-router/
│       ├── index.ts              — LLMRouter class, unified chat+embed entry
│       ├── providers/
│       │   ├── anthropic.ts
│       │   ├── openai.ts
│       │   ├── google.ts
│       │   └── bedrock.ts
│       ├── fallback-chain.ts     — Fallback chain + hot-swap logic
│       └── embed-queue.ts        — Priority queue for embed requests
├── test/
│   ├── agent-runtime.test.ts
│   ├── prompt-assembly.test.ts
│   ├── tool-execution.test.ts
│   ├── streaming-engine.test.ts
│   ├── circuit-breaker.test.ts
│   ├── compaction/
│   │   ├── tool-result-budget.test.ts
│   │   ├── time-microcompact.test.ts
│   │   ├── cached-microcompact.test.ts
│   │   ├── history-snip.test.ts
│   │   ├── context-collapse.test.ts
│   │   ├── sm-compact.test.ts
│   │   ├── legacy-compact.test.ts
│   │   └── pipeline.test.ts
│   └── llm-router/
│       ├── router.test.ts
│       ├── fallback-chain.test.ts
│       └── embed-queue.test.ts
```

---

### Task 1: Agent Runtime Internal Types + Circuit Breaker

**Files:**
- Create: `packages/agent-runtime/src/types.ts`
- Create: `packages/agent-runtime/src/circuit-breaker.ts`
- Test: `packages/agent-runtime/test/circuit-breaker.test.ts`

- [ ] **Step 1: Write failing circuit-breaker test**

`packages/agent-runtime/test/circuit-breaker.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "bun:test";
import { CircuitBreaker } from "@miniclaw/agent-runtime";

describe("CircuitBreaker", () => {
	let cb: CircuitBreaker;

	beforeEach(() => {
		cb = new CircuitBreaker({ halfOpenAfterMs: 600, successThreshold: 2, failureThreshold: 3 });
	});

	it("starts in closed state", () => {
		expect(cb.state).toBe("closed");
	});

	it("transitions to open after failureThreshold failures", () => {
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("closed");
		cb.recordFailure();
		expect(cb.state).toBe("open");
	});

	it("rejects calls immediately in open state", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("open");
		expect(cb.allowRequest()).toBe(false);
	});

	it("transitions to half-open after halfOpenAfterMs", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("open");

		vi.useFakeTimers();
		vi.advanceTimersByTime(700);
		expect(cb.state).toBe("half-open");
		expect(cb.allowRequest()).toBe(true);
		vi.useRealTimers();
	});

	it("recovers to closed after successThreshold successes in half-open", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();

		vi.useFakeTimers();
		vi.advanceTimersByTime(700);
		vi.useRealTimers();

		expect(cb.state).toBe("half-open");
		cb.recordSuccess();
		expect(cb.state).toBe("half-open");
		cb.recordSuccess();
		expect(cb.state).toBe("closed");
	});

	it("returns to open on failure in half-open", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();

		vi.useFakeTimers();
		vi.advanceTimersByTime(700);
		vi.useRealTimers();

		cb.recordFailure();
		expect(cb.state).toBe("open");
	});

	it("resets failure count on success in closed state", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordSuccess();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("closed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/circuit-breaker.test.ts`
Expected: FAIL -- `@miniclaw/agent-runtime` not found or `CircuitBreaker` not exported

- [ ] **Step 3: Update agent-runtime package.json with dependencies**

`packages/agent-runtime/package.json`:
```json
{
  "name": "@miniclaw/agent-runtime",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@miniclaw/plugin-api": "workspace:*",
    "@miniclaw/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Write types.ts**

`packages/agent-runtime/src/types.ts`:
```typescript
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

/** State of the circuit breaker */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/** Configuration for the circuit breaker */
export interface CircuitBreakerConfig {
	/** Milliseconds before transitioning from open to half-open. Default: 600000 (10min) */
	halfOpenAfterMs: number;
	/** Consecutive successes in half-open to recover to closed. Default: 2 */
	successThreshold: number;
	/** Consecutive failures to trip from closed to open. Default: 3 */
	failureThreshold: number;
}

/** A single message in the agent conversation */
export interface AgentMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	toolCalls?: ToolCall[];
	toolCallId?: string;
	timestamp: number;
}

/** A tool call requested by the LLM */
export interface ToolCall {
	id: string;
	name: string;
	arguments: string;
}

/** Result of executing a tool */
export interface ToolResult {
	toolCallId: string;
	content: string;
	isError: boolean;
}

/** Definition of a tool the LLM can call */
export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<string>;
}

/** Context passed to tool execution */
export interface ToolExecutionContext {
	sessionId: string;
	workingDir: string;
	readOnly: boolean;
	enqueueReply: (content: string) => void;
}

/** LLM provider configuration */
export interface LLMProviderConfig {
	name: string;
	type: "anthropic" | "openai" | "google" | "bedrock";
	model: string;
	apiKeyEnvVar: string;
	baseUrl?: string;
	maxTokens: number;
	priority: number;
}

/** Result of a prompt assembly step */
export interface AssembledPrompt {
	systemPrompt: string;
	messages: AgentMessage[];
	estimatedTokens: number;
}

/** Compaction level result */
export interface CompactionResult {
	level: number;
	applied: boolean;
	tokensFreed: number;
	summary?: string;
}

/** Streaming chunk */
export interface StreamChunk {
	type: "text" | "tool_call" | "tool_result" | "done";
	content: string;
	toolCall?: ToolCall;
	toolResult?: ToolResult;
}

/** Embed request with priority */
export interface EmbedRequest {
	id: string;
	text: string;
	priority: "session_chat" | "memory_search" | "rag_indexing";
	tenantId?: string;
	resolve: (embedding: number[]) => void;
	reject: (error: Error) => void;
}
```

- [ ] **Step 5: Implement circuit-breaker.ts**

`packages/agent-runtime/src/circuit-breaker.ts`:
```typescript
import type { CircuitBreakerState, CircuitBreakerConfig } from "./types";

const DEFAULT_CONFIG: CircuitBreakerConfig = {
	halfOpenAfterMs: 600000,
	successThreshold: 2,
	failureThreshold: 3,
};

export class CircuitBreaker {
	private config: CircuitBreakerConfig;
	private _state: CircuitBreakerState = "closed";
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime = 0;

	constructor(config: Partial<CircuitBreakerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	get state(): CircuitBreakerState {
		if (this._state === "open") {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed >= this.config.halfOpenAfterMs) {
				return "half-open";
			}
		}
		return this._state;
	}

	allowRequest(): boolean {
		const currentState = this.state;
		if (currentState === "closed") return true;
		if (currentState === "half-open") return true;
		return false;
	}

	recordSuccess(): void {
		const currentState = this.state;
		if (currentState === "half-open") {
			this.successCount++;
			if (this.successCount >= this.config.successThreshold) {
				this._state = "closed";
				this.failureCount = 0;
				this.successCount = 0;
			}
		} else if (currentState === "closed") {
			this.failureCount = 0;
		}
	}

	recordFailure(): void {
		const currentState = this.state;
		this.lastFailureTime = Date.now();

		if (currentState === "closed") {
			this.failureCount++;
			if (this.failureCount >= this.config.failureThreshold) {
				this._state = "open";
			}
		} else if (currentState === "half-open") {
			this._state = "open";
			this.successCount = 0;
		}
	}

	reset(): void {
		this._state = "closed";
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = 0;
	}
}
```

- [ ] **Step 6: Write agent-runtime/src/index.ts (initial shell)**

`packages/agent-runtime/src/index.ts`:
```typescript
export { CircuitBreaker } from "./circuit-breaker";
export type {
	CircuitBreakerState,
	CircuitBreakerConfig,
	AgentMessage,
	ToolCall,
	ToolResult,
	ToolDefinition,
	ToolExecutionContext,
	LLMProviderConfig,
	AssembledPrompt,
	CompactionResult,
	StreamChunk,
	EmbedRequest,
} from "./types";
```

- [ ] **Step 7: Run bun install to link workspace**

Run: `cd /mnt/d/miniclaw && bun install`
Expected: workspace packages resolved

- [ ] **Step 8: Run circuit-breaker tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/circuit-breaker.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add internal types and CircuitBreaker with half-open state"
```

---

### Task 2: LLM Provider Adapters (Anthropic + OpenAI)

**Files:**
- Create: `packages/agent-runtime/src/llm-router/providers/anthropic.ts`
- Create: `packages/agent-runtime/src/llm-router/providers/openai.ts`
- Create: `packages/agent-runtime/src/llm-router/providers/google.ts`
- Create: `packages/agent-runtime/src/llm-router/providers/bedrock.ts`
- Test: `packages/agent-runtime/test/llm-router/router.test.ts`

- [ ] **Step 1: Install provider SDKs**

Run: `cd /mnt/d/miniclaw && bun add -d @anthropic-ai/sdk openai @google/generative-ai @aws-sdk/client-bedrock-runtime`

- [ ] **Step 2: Write failing provider tests**

`packages/agent-runtime/test/llm-router/router.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "bun:test";
import { AnthropicProvider } from "@miniclaw/agent-runtime/llm-router/providers/anthropic";
import { OpenAIProvider } from "@miniclaw/agent-runtime/llm-router/providers/openai";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

describe("AnthropicProvider", () => {
	it("converts LLMRequest to Anthropic format and returns LLMResponse", async () => {
		const mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "Hello from Claude" }],
			model: "claude-sonnet-4-20250514",
			usage: { input_tokens: 10, output_tokens: 5 },
		});

		const provider = new AnthropicProvider({
			apiKey: "sk-ant-test-key",
			model: "claude-sonnet-4-20250514",
			maxTokens: 4096,
		}, { messages: { create: mockCreate } } as any);

		const req: LLMRequest = {
			prompt: "Say hello",
			systemPrompt: "You are helpful",
			maxTokens: 100,
		};

		const res = await provider.chat(req);
		expect(res.text).toBe("Hello from Claude");
		expect(res.model).toBe("claude-sonnet-4-20250514");
		expect(res.usage?.inputTokens).toBe(10);
		expect(res.usage?.outputTokens).toBe(5);
	});

	it("returns embedding vector of correct dimension", async () => {
		const mockEmbed = vi.fn().mockResolvedValue({
			data: [{ embedding: new Array(1536).fill(0.1) }],
		});

		const provider = new AnthropicProvider({
			apiKey: "sk-ant-test-key",
			model: "claude-sonnet-4-20250514",
			maxTokens: 4096,
		}, {} as any);
		provider._mockEmbed = mockEmbed;

		const embedding = await provider.embed("test text");
		expect(embedding.length).toBe(1536);
	});
});

describe("OpenAIProvider", () => {
	it("converts LLMRequest to OpenAI format and returns LLMResponse", async () => {
		const mockCreate = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "Hello from GPT" } }],
			model: "gpt-4o",
			usage: { prompt_tokens: 10, completion_tokens: 5 },
		});

		const provider = new OpenAIProvider({
			apiKey: "sk-test-key",
			model: "gpt-4o",
			maxTokens: 4096,
		}, { chat: { completions: { create: mockCreate } } } as any);

		const req: LLMRequest = {
			prompt: "Say hello",
			systemPrompt: "You are helpful",
		};

		const res = await provider.chat(req);
		expect(res.text).toBe("Hello from GPT");
		expect(res.model).toBe("gpt-4o");
		expect(res.usage?.inputTokens).toBe(10);
		expect(res.usage?.outputTokens).toBe(5);
	});

	it("returns embedding via embed endpoint", async () => {
		const mockEmbed = vi.fn().mockResolvedValue({
			data: [{ embedding: new Array(3072).fill(0.05) }],
		});

		const provider = new OpenAIProvider({
			apiKey: "sk-test-key",
			model: "gpt-4o",
			maxTokens: 4096,
		}, { embeddings: { create: mockEmbed } } as any);

		const embedding = await provider.embed("test text", "text-embedding-3-large");
		expect(embedding.length).toBe(3072);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/router.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 4: Implement AnthropicProvider**

`packages/agent-runtime/src/llm-router/providers/anthropic.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import type { LLMProviderConfig } from "../../types";

export interface AnthropicProviderDeps {
	messages?: {
		create: (params: Anthropic.MessageCreateParams) => Promise<Anthropic.Message>;
	};
}

export class AnthropicProvider {
	private client: Anthropic | null = null;
	private deps: AnthropicProviderDeps;
	public _mockEmbed?: (input: string, model: string) => Promise<{ data: Array<{ embedding: number[] }> }>;

	constructor(
		private config: { apiKey: string; model: string; maxTokens: number; baseUrl?: string },
		deps?: AnthropicProviderDeps,
	) {
		this.deps = deps ?? {};
		if (!deps?.messages) {
			this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
		}
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.prompt }];

		const params: Anthropic.MessageCreateParams = {
			model: req.model ?? this.config.model,
			max_tokens: req.maxTokens ?? this.config.maxTokens,
			messages,
			system: req.systemPrompt ?? undefined,
			temperature: req.temperature,
		};

		const msg = this.deps.messages
			? await this.deps.messages.create(params)
			: await this.client!.messages.create(params, { signal });

		const textBlock = msg.content.find((b) => b.type === "text");
		return {
			text: textBlock?.type === "text" ? textBlock.text : "",
			model: msg.model,
			usage: msg.usage
				? { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }
				: undefined,
		};
	}

	async embed(text: string, model = "text-embedding-3-large"): Promise<number[]> {
		if (this._mockEmbed) {
			const res = await this._mockEmbed(text, model);
			return res.data[0].embedding;
		}
		throw new Error("Anthropic does not provide a native embed endpoint; use OpenAI or Google for embeddings");
	}
}
```

- [ ] **Step 5: Implement OpenAIProvider**

`packages/agent-runtime/src/llm-router/providers/openai.ts`:
```typescript
import OpenAI from "openai";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

export interface OpenAIProviderDeps {
	chat?: { completions: { create: (params: any) => Promise<any> } };
	embeddings?: { create: (params: any) => Promise<any> };
}

export class OpenAIProvider {
	private client: OpenAI | null = null;
	private deps: OpenAIProviderDeps;

	constructor(
		private config: { apiKey: string; model: string; maxTokens: number; baseUrl?: string },
		deps?: OpenAIProviderDeps,
	) {
		this.deps = deps ?? {};
		if (!deps?.chat) {
			this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
		}
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const params = {
			model: req.model ?? this.config.model,
			max_tokens: req.maxTokens ?? this.config.maxTokens,
			messages: [
				...(req.systemPrompt ? [{ role: "system" as const, content: req.systemPrompt }] : []),
				{ role: "user" as const, content: req.prompt },
			],
			temperature: req.temperature,
		};

		const completion = this.deps.chat
			? await this.deps.chat.completions.create(params)
			: await this.client!.chat.completions.create(params, { signal });

		return {
			text: completion.choices[0]?.message?.content ?? "",
			model: completion.model,
			usage: completion.usage
				? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens }
				: undefined,
		};
	}

	async embed(text: string, model = "text-embedding-3-large"): Promise<number[]> {
		const params = { input: text, model };

		const result = this.deps.embeddings
			? await this.deps.embeddings.create(params)
			: await this.client!.embeddings.create(params);

		return result.data[0].embedding;
	}
}
```

- [ ] **Step 6: Implement Google and Bedrock stubs**

`packages/agent-runtime/src/llm-router/providers/google.ts`:
```typescript
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

export class GoogleProvider {
	constructor(
		private config: { apiKey: string; model: string; maxTokens: number },
	) {}

	async chat(_req: LLMRequest, _signal?: AbortSignal): Promise<LLMResponse> {
		throw new Error("Google provider not yet implemented — use Anthropic or OpenAI in v1");
	}

	async embed(_text: string, _model?: string): Promise<number[]> {
		throw new Error("Google embed not yet implemented — use OpenAI for embeddings in v1");
	}
}
```

`packages/agent-runtime/src/llm-router/providers/bedrock.ts`:
```typescript
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

export class BedrockProvider {
	constructor(
		private config: { apiKey: string; model: string; maxTokens: number; region: string },
	) {}

	async chat(_req: LLMRequest, _signal?: AbortSignal): Promise<LLMResponse> {
		throw new Error("Bedrock provider not yet implemented — use Anthropic or OpenAI in v1");
	}

	async embed(_text: string, _model?: string): Promise<number[]> {
		throw new Error("Bedrock embed not yet implemented — use OpenAI for embeddings in v1");
	}
}
```

- [ ] **Step 7: Update index.ts to export providers**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { AnthropicProvider } from "./llm-router/providers/anthropic";
export type { AnthropicProviderDeps } from "./llm-router/providers/anthropic";
export { OpenAIProvider } from "./llm-router/providers/openai";
export type { OpenAIProviderDeps } from "./llm-router/providers/openai";
export { GoogleProvider } from "./llm-router/providers/google";
export { BedrockProvider } from "./llm-router/providers/bedrock";
```

- [ ] **Step 8: Run provider tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/router.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add LLM provider adapters for Anthropic and OpenAI"
```

---

### Task 3: LLM Router — Unified Entry + Fallback Chain + Hot-Swap

**Files:**
- Create: `packages/agent-runtime/src/llm-router/index.ts`
- Create: `packages/agent-runtime/src/llm-router/fallback-chain.ts`
- Test: `packages/agent-runtime/test/llm-router/fallback-chain.test.ts`

- [ ] **Step 1: Write failing fallback-chain tests**

`packages/agent-runtime/test/llm-router/fallback-chain.test.ts`:
```typescript
import { describe, it, expect, vi } from "bun:test";
import { FallbackChain } from "@miniclaw/agent-runtime/llm-router/fallback-chain";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

function makeProvider(name: string, response: string, shouldFail = false) {
	return {
		name,
		chat: vi.fn(async (_req: LLMRequest): Promise<LLMResponse> => {
			if (shouldFail) throw new Error(`${name} failed`);
			return { text: response, model: name };
		}),
		embed: vi.fn(async (_text: string) => new Array(1536).fill(0.1)),
	};
}

describe("FallbackChain", () => {
	it("uses first provider when it succeeds", async () => {
		const primary = makeProvider("primary", "hello");
		const fallback = makeProvider("fallback", "world");
		const chain = new FallbackChain([primary, fallback]);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("hello");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(0);
	});

	it("falls back to second provider when first fails", async () => {
		const primary = makeProvider("primary", "hello", true);
		const fallback = makeProvider("fallback", "world");
		const chain = new FallbackChain([primary, fallback]);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("world");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(1);
	});

	it("throws when all providers fail", async () => {
		const p1 = makeProvider("p1", "", true);
		const p2 = makeProvider("p2", "", true);
		const chain = new FallbackChain([p1, p2]);
		await expect(chain.chat({ prompt: "hi" })).rejects.toThrow("All providers failed");
	});

	it("hot-swaps provider at runtime", async () => {
		const old = makeProvider("old", "old-response");
		const replacement = makeProvider("new", "new-response");
		const chain = new FallbackChain([old]);
		chain.hotSwap("old", replacement);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("new-response");
		expect(old.chat).toHaveBeenCalledTimes(0);
		expect(replacement.chat).toHaveBeenCalledTimes(1);
	});

	it("hot-swap no-op when name not found", () => {
		const old = makeProvider("old", "old-response");
		const chain = new FallbackChain([old]);
		chain.hotSwap("nonexistent", makeProvider("x", "x"));
		expect(chain.providers.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/fallback-chain.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement FallbackChain**

`packages/agent-runtime/src/llm-router/fallback-chain.ts`:
```typescript
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import { RetryableError } from "@miniclaw/plugin-api";

export interface ProviderLike {
	name: string;
	chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>;
	embed(text: string, model?: string): Promise<number[]>;
}

export class FallbackChain {
	private _providers: ProviderLike[];

	constructor(providers: ProviderLike[]) {
		this._providers = [...providers];
	}

	get providers(): ProviderLike[] {
		return [...this._providers];
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const errors: Error[] = [];
		for (const provider of this._providers) {
			try {
				return await provider.chat(req, signal);
			} catch (err) {
				errors.push(err instanceof Error ? err : new Error(String(err)));
			}
		}
		throw new Error(
			`All providers failed: ${errors.map((e) => e.message).join("; ")}`,
		);
	}

	async embed(text: string, model?: string): Promise<number[]> {
		const errors: Error[] = [];
		for (const provider of this._providers) {
			try {
				return await provider.embed(text, model);
			} catch (err) {
				errors.push(err instanceof Error ? err : new Error(String(err)));
			}
		}
		throw new Error(
			`All providers failed for embed: ${errors.map((e) => e.message).join("; ")}`,
		);
	}

	hotSwap(name: string, replacement: ProviderLike): void {
		const idx = this._providers.findIndex((p) => p.name === name);
		if (idx !== -1) {
			this._providers[idx] = replacement;
		}
	}
}
```

- [ ] **Step 4: Implement LLMRouter**

`packages/agent-runtime/src/llm-router/index.ts`:
```typescript
import type { LLMRequest, LLMResponse, LLMOptions } from "@miniclaw/plugin-api";
import type { LLMProviderConfig, EmbedRequest } from "../types";
import { FallbackChain } from "./fallback-chain";
import type { ProviderLike } from "./fallback-chain";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { CircuitBreaker } from "../circuit-breaker";
import { EmbedQueue } from "./embed-queue";

export class LLMRouter {
	private chain: FallbackChain;
	private breakers: Map<string, CircuitBreaker> = new Map();
	private embedQueue: EmbedQueue;

	constructor(providerConfigs: LLMProviderConfig[]) {
		const providers: ProviderLike[] = providerConfigs
			.sort((a, b) => a.priority - b.priority)
			.map((cfg) => {
				this.breakers.set(cfg.name, new CircuitBreaker());
				return this.createProvider(cfg);
			});
		this.chain = new FallbackChain(providers);
		this.embedQueue = new EmbedQueue();
	}

	async chat(req: LLMRequest, opts?: LLMOptions): Promise<LLMResponse> {
		for (const provider of this.chain.providers) {
			const breaker = this.breakers.get(provider.name);
			if (breaker && !breaker.allowRequest()) continue;
			try {
				const res = await provider.chat(req, opts?.signal);
				breaker?.recordSuccess();
				return res;
			} catch (err) {
				breaker?.recordFailure();
			}
		}
		throw new Error("All LLM providers unavailable — circuit breakers open or all failed");
	}

	async embed(text: string, priority: EmbedRequest["priority"] = "memory_search", model?: string, tenantId?: string): Promise<number[]> {
		return new Promise<number[]>((resolve, reject) => {
			this.embedQueue.enqueue({
				id: crypto.randomUUID(),
				text,
				priority,
				tenantId,
				resolve,
				reject,
			});
		});
	}

	hotSwapProvider(name: string, newConfig: LLMProviderConfig): void {
		const replacement = this.createProvider(newConfig);
		this.chain.hotSwap(name, replacement);
		this.breakers.set(newConfig.name, new CircuitBreaker());
	}

	private createProvider(cfg: LLMProviderConfig): ProviderLike {
		const apiKey = process.env[cfg.apiKeyEnvVar] ?? "";
		switch (cfg.type) {
			case "anthropic":
				return { name: cfg.name, ...new AnthropicProvider({ apiKey, model: cfg.model, maxTokens: cfg.maxTokens }) };
			case "openai":
				return { name: cfg.name, ...new OpenAIProvider({ apiKey, model: cfg.model, maxTokens: cfg.maxTokens }) };
			default:
				throw new Error(`Unknown provider type: ${cfg.type}`);
		}
	}
}
```

- [ ] **Step 5: Update index.ts exports**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { LLMRouter } from "./llm-router";
export { FallbackChain } from "./llm-router/fallback-chain";
export type { ProviderLike } from "./llm-router/fallback-chain";
```

- [ ] **Step 6: Run all router tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add LLMRouter with fallback chain, circuit breakers, and hot-swap"
```

---

### Task 4: Embed Priority Queue

**Files:**
- Create: `packages/agent-runtime/src/llm-router/embed-queue.ts`
- Test: `packages/agent-runtime/test/llm-router/embed-queue.test.ts`

- [ ] **Step 1: Write failing embed-queue tests**

`packages/agent-runtime/test/llm-router/embed-queue.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "bun:test";
import { EmbedQueue } from "@miniclaw/agent-runtime/llm-router/embed-queue";

describe("EmbedQueue", () => {
	let queue: EmbedQueue;

	beforeEach(() => {
		queue = new EmbedQueue();
	});

	it("processes session_chat requests before memory_search", async () => {
		const order: string[] = [];
		const embedFn = vi.fn(async (text: string) => {
			order.push(text);
			return new Array(10).fill(0);
		});

		queue.setEmbedFn(embedFn);
		queue.startProcessing();

		const p2 = queue.enqueue({
			id: "2",
			text: "memory",
			priority: "memory_search",
			resolve: () => {},
			reject: () => {},
		});
		const p3 = queue.enqueue({
			id: "3",
			text: "rag",
			priority: "rag_indexing",
			resolve: () => {},
			reject: () => {},
		});
		const p1 = queue.enqueue({
			id: "1",
			text: "chat",
			priority: "session_chat",
			resolve: () => {},
			reject: () => {},
		});

		await queue.drain();
		expect(order[0]).toBe("chat");
		expect(order[1]).toBe("memory");
		expect(order[2]).toBe("rag");
	});

	it("resolves promise with embedding result", async () => {
		const embedding = new Array(1536).fill(0.42);
		queue.setEmbedFn(async () => embedding);
		queue.startProcessing();

		const result = await new Promise<number[]>((resolve, reject) => {
			queue.enqueue({
				id: "x",
				text: "test",
				priority: "session_chat",
				resolve,
				reject,
			});
			queue.drain();
		});

		expect(result).toEqual(embedding);
	});

	it("rejects promise on embed failure", async () => {
		queue.setEmbedFn(async () => {
			throw new Error("embed failed");
		});
		queue.startProcessing();

		const result = await new Promise<unknown>((resolve) => {
			queue.enqueue({
				id: "y",
				text: "test",
				priority: "session_chat",
				resolve: () => resolve("should not resolve"),
				reject: (err: Error) => resolve(err.message),
			});
			queue.drain();
		});

		expect(result).toBe("embed failed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/embed-queue.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement EmbedQueue**

`packages/agent-runtime/src/llm-router/embed-queue.ts`:
```typescript
import type { EmbedRequest } from "../types";

const PRIORITY_ORDER: Record<EmbedRequest["priority"], number> = {
	session_chat: 0,
	memory_search: 1,
	rag_indexing: 2,
};

export class EmbedQueue {
	private queue: EmbedRequest[] = [];
	private processing = false;
	private embedFn: ((text: string, model?: string) => Promise<number[]>) | null = null;

	setEmbedFn(fn: (text: string, model?: string) => Promise<number[]>): void {
		this.embedFn = fn;
	}

	startProcessing(): void {
		if (!this.processing) {
			this.processing = true;
			this.processNext();
		}
	}

	enqueue(req: EmbedRequest): void {
		this.queue.push(req);
		this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
	}

	async drain(): Promise<void> {
		while (this.queue.length > 0) {
			await this.processNext();
		}
	}

	private async processNext(): Promise<void> {
		if (this.queue.length === 0 || !this.embedFn) return;

		const req = this.queue.shift()!;
		try {
			const embedding = await this.embedFn(req.text);
			req.resolve(embedding);
		} catch (err) {
			req.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}
}
```

- [ ] **Step 4: Run embed-queue tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/llm-router/embed-queue.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add embed priority queue with session > memory > RAG ordering"
```

---

### Task 5: Tool Registry + Built-in Tools (bash, read_file, list_files)

**Files:**
- Create: `packages/agent-runtime/src/tool-execution.ts`
- Create: `packages/agent-runtime/src/tools/bash.ts`
- Create: `packages/agent-runtime/src/tools/read-file.ts`
- Create: `packages/agent-runtime/src/tools/list-files.ts`
- Test: `packages/agent-runtime/test/tool-execution.test.ts`

- [ ] **Step 1: Write failing tool-execution tests**

`packages/agent-runtime/test/tool-execution.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { ToolRegistry } from "@miniclaw/agent-runtime/tool-execution";
import type { ToolDefinition, ToolExecutionContext } from "@miniclaw/agent-runtime";

const mockCtx: ToolExecutionContext = {
	sessionId: "test",
	workingDir: "/tmp",
	readOnly: true,
	enqueueReply: () => {},
};

describe("ToolRegistry", () => {
	let registry: ToolRegistry;

	beforeEach(() => {
		registry = new ToolRegistry();
	});

	it("registers and executes a tool", async () => {
		registry.register({
			name: "echo",
			description: "Echoes input",
			parameters: { type: "object", properties: { text: { type: "string" } } },
			execute: async (args) => args.text as string,
		});

		const result = await registry.execute("echo", { text: "hello" }, mockCtx);
		expect(result).toBe("hello");
	});

	it("throws on unknown tool", async () => {
		await expect(registry.execute("nope", {}, mockCtx)).rejects.toThrow("Tool not found: nope");
	});

	it("returns tool definitions for LLM", () => {
		registry.register({
			name: "echo",
			description: "Echoes input",
			parameters: { type: "object", properties: { text: { type: "string" } } },
			execute: async (args) => args.text as string,
		});

		const defs = registry.getDefinitions();
		expect(defs).toHaveLength(1);
		expect(defs[0].name).toBe("echo");
	});

	it("bash tool rejects write commands in readOnly mode", async () => {
		const { BashTool } = await import("@miniclaw/agent-runtime/tools/bash");
		const bash = new BashTool();
		await expect(bash.execute({ command: "rm -rf /tmp/test" }, { ...mockCtx, readOnly: true })).rejects.toThrow("read-only");
	});

	it("read_file tool reads existing file", async () => {
		const { ReadFileTool } = await import("@miniclaw/agent-runtime/tools/read-file");
		const tool = new ReadFileTool();
		const content = await tool.execute({ path: "/etc/hostname" }, { ...mockCtx, workingDir: "/" });
		expect(typeof content).toBe("string");
		expect(content.length).toBeGreaterThan(0);
	});

	it("list_files tool returns directory listing", async () => {
		const { ListFilesTool } = await import("@miniclaw/agent-runtime/tools/list-files");
		const tool = new ListFilesTool();
		const result = await tool.execute({ path: "/tmp" }, { ...mockCtx, workingDir: "/tmp" });
		expect(typeof result).toBe("string");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/tool-execution.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolRegistry**

`packages/agent-runtime/src/tool-execution.ts`:
```typescript
import type { ToolDefinition, ToolExecutionContext } from "./types";

export class ToolRegistry {
	private tools = new Map<string, ToolDefinition>();

	register(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}

	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name);
	}

	getDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		}));
	}

	async execute(name: string, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const tool = this.tools.get(name);
		if (!tool) throw new Error(`Tool not found: ${name}`);
		return tool.execute(args, ctx);
	}
}
```

- [ ] **Step 4: Implement BashTool**

`packages/agent-runtime/src/tools/bash.ts`:
```typescript
import type { ToolDefinition, ToolExecutionContext } from "../types";

const WRITE_COMMANDS = ["rm", "mv", "cp", "mkdir", "touch", "chmod", "chown", "dd", "mkfs", ">", ">>"];

export class BashTool {
	get definition(): ToolDefinition {
		return {
			name: "bash",
			description: "Execute a bash command. Read-only by default — write commands are blocked unless readOnly is false.",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string", description: "The bash command to execute" },
				},
				required: ["command"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const command = args.command as string;
		if (!command) throw new Error("command is required");

		if (ctx.readOnly) {
			const normalizedCmd = command.trim().toLowerCase();
			for (const wc of WRITE_COMMANDS) {
				if (normalizedCmd.startsWith(wc) || normalizedCmd.includes(` ${wc} `)) {
					throw new Error(`Command blocked in read-only mode: contains "${wc}"`);
				}
			}
		}

		const proc = Bun.spawn(["bash", "-c", command], {
			cwd: ctx.workingDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		if (exitCode !== 0) {
			return `Exit code ${exitCode}\n${stdout}${stderr}`;
		}
		return stdout || "(no output)";
	}
}
```

- [ ] **Step 5: Implement ReadFileTool**

`packages/agent-runtime/src/tools/read-file.ts`:
```typescript
import { readFile } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition, ToolExecutionContext } from "../types";

export class ReadFileTool {
	get definition(): ToolDefinition {
		return {
			name: "read_file",
			description: "Read the contents of a file at the given path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative or absolute file path" },
				},
				required: ["path"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const filePath = args.path as string;
		if (!filePath) throw new Error("path is required");

		const absolutePath = resolve(ctx.workingDir, filePath);
		const content = await readFile(absolutePath, "utf-8");
		return content;
	}
}
```

- [ ] **Step 6: Implement ListFilesTool**

`packages/agent-runtime/src/tools/list-files.ts`:
```typescript
import { readdir, stat } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition, ToolExecutionContext } from "../types";

export class ListFilesTool {
	get definition(): ToolDefinition {
		return {
			name: "list_files",
			description: "List files and directories at the given path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory path to list. Defaults to working directory." },
				},
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const dirPath = (args.path as string) || ".";
		const absolutePath = resolve(ctx.workingDir, dirPath);

		const entries = await readdir(absolutePath, { withFileTypes: true });
		const results: string[] = [];

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const type = entry.isDirectory() ? "DIR" : "FILE";
			const fullPath = resolve(absolutePath, entry.name);
			try {
				const s = await stat(fullPath);
				results.push(`${type}  ${entry.name}  (${s.size} bytes)`);
			} catch {
				results.push(`${type}  ${entry.name}  (unreadable)`);
			}
		}

		return results.length > 0 ? results.join("\n") : "(empty directory)";
	}
}
```

- [ ] **Step 7: Update index.ts to export tool modules**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { ToolRegistry } from "./tool-execution";
export { BashTool } from "./tools/bash";
export { ReadFileTool } from "./tools/read-file";
export { ListFilesTool } from "./tools/list-files";
```

- [ ] **Step 8: Run tool-execution tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/tool-execution.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add ToolRegistry and built-in tools (bash, read_file, list_files)"
```

---

### Task 6: spawn_sub_agent Tool

**Files:**
- Create: `packages/agent-runtime/src/tools/spawn-sub-agent.ts`
- Test: `packages/agent-runtime/test/tool-execution.test.ts` (extend)

- [ ] **Step 1: Add failing spawn_sub_agent test cases to tool-execution.test.ts**

Append to `packages/agent-runtime/test/tool-execution.test.ts`:
```typescript
describe("SpawnSubAgentTool", () => {
	it("returns a task ID and spawns background task", async () => {
		const { SpawnSubAgentTool } = await import("@miniclaw/agent-runtime/tools/spawn-sub-agent");
		const spawnFn = vi.fn(async () => "task-123");
		const tool = new SpawnSubAgentTool(spawnFn);
		const result = await tool.execute({ task: "do something" }, mockCtx);
		expect(result).toContain("task-123");
		expect(spawnFn).toHaveBeenCalledTimes(1);
	});

	it("validates task parameter is required", async () => {
		const { SpawnSubAgentTool } = await import("@miniclaw/agent-runtime/tools/spawn-sub-agent");
		const tool = new SpawnSubAgentTool(async () => "task-abc");
		await expect(tool.execute({}, mockCtx)).rejects.toThrow("task is required");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/tool-execution.test.ts`
Expected: FAIL -- SpawnSubAgentTool not found

- [ ] **Step 3: Implement SpawnSubAgentTool**

`packages/agent-runtime/src/tools/spawn-sub-agent.ts`:
```typescript
import type { ToolDefinition, ToolExecutionContext } from "../types";

export type SpawnFn = (task: string, sessionId: string) => Promise<string>;

export class SpawnSubAgentTool {
	constructor(private spawnFn: SpawnFn) {}

	get definition(): ToolDefinition {
		return {
			name: "spawn_sub_agent",
			description: "Spawn a background sub-agent to handle a task independently. Returns a task ID for tracking.",
			parameters: {
				type: "object",
				properties: {
					task: { type: "string", description: "Description of the task for the sub-agent" },
				},
				required: ["task"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const task = args.task as string;
		if (!task) throw new Error("task is required");

		const taskId = await this.spawnFn(task, ctx.sessionId);
		return `Sub-agent spawned. Task ID: ${taskId}\nTask: ${task}`;
	}
}
```

- [ ] **Step 4: Update index.ts**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { SpawnSubAgentTool } from "./tools/spawn-sub-agent";
export type { SpawnFn } from "./tools/spawn-sub-agent";
```

- [ ] **Step 5: Run tool-execution tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/tool-execution.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add spawn_sub_agent tool with background task spawning"
```

---

### Task 7: Prompt Assembly

**Files:**
- Create: `packages/agent-runtime/src/prompt-assembly.ts`
- Test: `packages/agent-runtime/test/prompt-assembly.test.ts`

- [ ] **Step 1: Write failing prompt-assembly tests**

`packages/agent-runtime/test/prompt-assembly.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { PromptAssembler } from "@miniclaw/agent-runtime/prompt-assembly";
import type { AgentMessage } from "@miniclaw/agent-runtime";

describe("PromptAssembler", () => {
	it("assembles system prompt with base instructions", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are miniclaw." });
		const result = assembler.assemble([], []);
		expect(result.systemPrompt).toContain("You are miniclaw.");
	});

	it("injects memory entries into system prompt", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are miniclaw." });
		const memories = [
			{ content: "User prefers Chinese", type: "user" as const, relevanceScore: 0.9 },
			{ content: "Project uses Bun", type: "project" as const, relevanceScore: 0.8 },
		];
		const result = assembler.assemble([], [], memories);
		expect(result.systemPrompt).toContain("User prefers Chinese");
		expect(result.systemPrompt).toContain("Project uses Bun");
	});

	it("injects tool descriptions into system prompt", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are miniclaw." });
		const toolDefs = [
			{ name: "bash", description: "Run a bash command", parameters: {} },
			{ name: "read_file", description: "Read file contents", parameters: {} },
		];
		const result = assembler.assemble([], toolDefs, []);
		expect(result.systemPrompt).toContain("bash");
		expect(result.systemPrompt).toContain("read_file");
	});

	it("estimates tokens using 4 chars per token heuristic", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are miniclaw." });
		const messages: AgentMessage[] = [
			{ role: "user", content: "hello world test", timestamp: Date.now() },
		];
		const result = assembler.assemble(messages, [], []);
		expect(result.estimatedTokens).toBeGreaterThan(0);
	});

	it("truncates messages that exceed maxTokens budget", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "short", maxTokens: 20 });
		const messages: AgentMessage[] = [
			{ role: "user", content: "a".repeat(200), timestamp: Date.now() },
		];
		const result = assembler.assemble(messages, [], []);
		expect(result.messages.length).toBeLessThanOrEqual(messages.length);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/prompt-assembly.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PromptAssembler**

`packages/agent-runtime/src/prompt-assembly.ts`:
```typescript
import type { AgentMessage } from "./types";

export interface MemoryEntry {
	content: string;
	type: string;
	relevanceScore?: number;
}

export interface ToolDef {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface PromptAssemblerConfig {
	baseSystemPrompt: string;
	maxTokens?: number;
}

export interface AssembledPrompt {
	systemPrompt: string;
	messages: AgentMessage[];
	estimatedTokens: number;
}

const CHARS_PER_TOKEN = 4;

export class PromptAssembler {
	private baseSystemPrompt: string;
	private maxTokens: number;

	constructor(config: PromptAssemblerConfig) {
		this.baseSystemPrompt = config.baseSystemPrompt;
		this.maxTokens = config.maxTokens ?? 128000;
	}

	assemble(
		messages: AgentMessage[],
		toolDefs: ToolDef[] = [],
		memories: MemoryEntry[] = [],
	): AssembledPrompt {
		const parts: string[] = [this.baseSystemPrompt];

		if (memories.length > 0) {
			parts.push("\n## Relevant Memories");
			for (const m of memories) {
				parts.push(`- [${m.type}] ${m.content}`);
			}
		}

		if (toolDefs.length > 0) {
			parts.push("\n## Available Tools");
			for (const t of toolDefs) {
				parts.push(`- ${t.name}: ${t.description}`);
			}
		}

		const systemPrompt = parts.join("\n");
		const systemTokens = Math.ceil(systemPrompt.length / CHARS_PER_TOKEN);

		let remainingBudget = this.maxTokens - systemTokens;
		if (remainingBudget < 0) remainingBudget = 0;

		const filteredMessages: AgentMessage[] = [];
		let usedTokens = 0;

		for (const msg of messages) {
			const msgTokens = Math.ceil(msg.content.length / CHARS_PER_TOKEN);
			if (usedTokens + msgTokens <= remainingBudget) {
				filteredMessages.push(msg);
				usedTokens += msgTokens;
			} else {
				break;
			}
		}

		return {
			systemPrompt,
			messages: filteredMessages,
			estimatedTokens: systemTokens + usedTokens,
		};
	}
}
```

- [ ] **Step 4: Update index.ts exports**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { PromptAssembler } from "./prompt-assembly";
export type { MemoryEntry, ToolDef, PromptAssemblerConfig, AssembledPrompt } from "./prompt-assembly";
```

- [ ] **Step 5: Run prompt-assembly tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/prompt-assembly.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add PromptAssembler with memory injection and token budget"
```

---

### Task 8: Streaming Engine

**Files:**
- Create: `packages/agent-runtime/src/streaming-engine.ts`
- Test: `packages/agent-runtime/test/streaming-engine.test.ts`

- [ ] **Step 1: Write failing streaming-engine tests**

`packages/agent-runtime/test/streaming-engine.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { StreamingEngine } from "@miniclaw/agent-runtime/streaming-engine";
import type { StreamChunk } from "@miniclaw/agent-runtime";

describe("StreamingEngine", () => {
	it("collects text chunks and emits at sentence boundaries", async () => {
		const engine = new StreamingEngine({ chunkSize: 50 });
		const chunks: string[] = [];

		engine.onChunk((text) => chunks.push(text));

		engine.push({ type: "text", content: "Hello world." });
		engine.push({ type: "text", content: " This is a test." });
		engine.push({ type: "text", content: " Second sentence here." });
		engine.end();

		await engine.finished();

		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks.join("")).toContain("Hello world.");
	});

	it("flushes remaining buffer on end()", async () => {
		const engine = new StreamingEngine({ chunkSize: 1000 });
		const chunks: string[] = [];

		engine.onChunk((text) => chunks.push(text));
		engine.push({ type: "text", content: "No period at end" });
		engine.end();

		await engine.finished();

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toBe("No period at end");
	});

	it("handles tool_call chunks by passing through immediately", async () => {
		const engine = new StreamingEngine({ chunkSize: 50 });
		const chunks: StreamChunk[] = [];

		engine.onRawChunk((chunk) => chunks.push(chunk));

		engine.push({ type: "tool_call", content: "", toolCall: { id: "tc1", name: "bash", arguments: "{}" } });
		engine.end();

		await engine.finished();

		expect(chunks.some((c) => c.type === "tool_call")).toBe(true);
	});

	it("applies backpressure: buffers up to limit then signals overflow", () => {
		const engine = new StreamingEngine({ chunkSize: 10, maxBuffer: 50 });
		const overflow = engine.push({ type: "text", content: "x".repeat(100) });

		expect(overflow).toBe(true);
	});

	it("fallBackToNonStreaming returns buffered text", () => {
		const engine = new StreamingEngine({ chunkSize: 100 });
		engine.push({ type: "text", content: "hello" });
		engine.push({ type: "text", content: " world" });
		const text = engine.fallBackToNonStreaming();

		expect(text).toBe("hello world");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/streaming-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement StreamingEngine**

`packages/agent-runtime/src/streaming-engine.ts`:
```typescript
import type { StreamChunk } from "./types";

export interface StreamingEngineConfig {
	chunkSize?: number;
	maxBuffer?: number;
}

const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/;

export class StreamingEngine {
	private buffer = "";
	private chunkSize: number;
	private maxBuffer: number;
	private onChunkFn: ((text: string) => void) | null = null;
	private onRawChunkFn: ((chunk: StreamChunk) => void) | null = null;
	private resolveFinish: (() => void) | null = null;
	private finishedPromise: Promise<void>;

	constructor(config: StreamingEngineConfig = {}) {
		this.chunkSize = config.chunkSize ?? 200;
		this.maxBuffer = config.maxBuffer ?? 1024 * 1024;
		this.finishedPromise = new Promise<void>((resolve) => {
			this.resolveFinish = resolve;
		});
	}

	onChunk(fn: (text: string) => void): void {
		this.onChunkFn = fn;
	}

	onRawChunk(fn: (chunk: StreamChunk) => void): void {
		this.onRawChunkFn = fn;
	}

	push(chunk: StreamChunk): boolean {
		if (chunk.type === "tool_call" || chunk.type === "tool_result" || chunk.type === "done") {
			this.onRawChunkFn?.(chunk);
			return false;
		}

		this.buffer += chunk.content;
		this.onRawChunkFn?.(chunk);

		const overflow = this.buffer.length > this.maxBuffer;

		while (this.buffer.length >= this.chunkSize) {
			const sentences = this.buffer.split(SENTENCE_BOUNDARY);
			if (sentences.length > 1) {
				const toEmit = sentences.slice(0, -1).join(" ");
				this.buffer = sentences[sentences.length - 1];
				this.onChunkFn?.(toEmit);
			} else {
				break;
			}
		}

		return overflow;
	}

	end(): void {
		if (this.buffer.length > 0) {
			this.onChunkFn?.(this.buffer);
			this.buffer = "";
		}
		this.onRawChunkFn?.({ type: "done", content: "" });
		this.resolveFinish?.();
	}

	finished(): Promise<void> {
		return this.finishedPromise;
	}

	fallBackToNonStreaming(): string {
		const text = this.buffer;
		this.buffer = "";
		return text;
	}
}
```

- [ ] **Step 4: Update index.ts exports**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { StreamingEngine } from "./streaming-engine";
export type { StreamingEngineConfig } from "./streaming-engine";
```

- [ ] **Step 5: Run streaming-engine tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/streaming-engine.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add StreamingEngine with sentence boundary cutting and backpressure"
```

---

### Task 9: Compaction Types + L1 Tool Result Budget

**Files:**
- Create: `packages/agent-runtime/src/compaction/types.ts`
- Create: `packages/agent-runtime/src/compaction/index.ts`
- Create: `packages/agent-runtime/src/compaction/tool-result-budget.ts`
- Test: `packages/agent-runtime/test/compaction/tool-result-budget.test.ts`

- [ ] **Step 1: Write compaction types**

`packages/agent-runtime/src/compaction/types.ts`:
```typescript
import type { AgentMessage } from "../types";

/** Configuration for the compaction pipeline */
export interface CompactionConfig {
	/** Max tokens allowed before compaction triggers. Default: 128000 */
	maxTokens: number;
	/** L1: Max characters per tool result. Default: 10000 */
	toolResultBudget: number;
	/** L2: Age in ms after which tool results are considered stale. Default: 3600000 (1h) */
	timeMicrocompactAgeMs: number;
	/** L4: Number of oldest message round-groups to delete per snip. Default: 1 */
	historySnipGroups: number;
	/** L6: Target token count for semantic compact summary. Default: maxTokens * 0.5 */
	smCompactTargetRatio: number;
}

/** Result of a single compaction level */
export interface CompactionLevelResult {
	level: number;
	name: string;
	applied: boolean;
	tokensBefore: number;
	tokensAfter: number;
	tokensFreed: number;
	summary?: string;
}

/** Hook messages emitted before/after L6 and L7 compaction */
export interface CompactionHookMessage {
	type: "onCompactionHookMessages";
	phase: "before" | "after";
	level: number;
	sessionId: string;
	deletedMessageCount: number;
	summary?: string;
}

/** CompactionProvider extension point (unused in v1, reserved) */
export interface CompactionProvider {
	name: string;
	compact(messages: AgentMessage[], config: CompactionConfig): Promise<AgentMessage[]>;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
	maxTokens: 128000,
	toolResultBudget: 10000,
	timeMicrocompactAgeMs: 3600000,
	historySnipGroups: 1,
	smCompactTargetRatio: 0.5,
};
```

- [ ] **Step 2: Write failing L1 tests**

`packages/agent-runtime/test/compaction/tool-result-budget.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { ToolResultBudget } from "@miniclaw/agent-runtime/compaction/tool-result-budget";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L1: ToolResultBudget", () => {
	it("truncates tool results exceeding budget", () => {
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "x".repeat(20000),
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];

		const l1 = new ToolResultBudget(DEFAULT_COMPACTION_CONFIG);
		const result = l1.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(1);
		expect(result.messages[0].content.length).toBeLessThanOrEqual(
			DEFAULT_COMPACTION_CONFIG.toolResultBudget + 50,
		);
	});

	it("does not truncate tool results within budget", () => {
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "short result",
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];

		const l1 = new ToolResultBudget(DEFAULT_COMPACTION_CONFIG);
		const result = l1.compact(messages);

		expect(result.applied).toBe(false);
		expect(result.messages[0].content).toBe("short result");
	});

	it("preserves non-tool messages", () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "hello", timestamp: Date.now() },
			{ role: "assistant", content: "hi", timestamp: Date.now() },
			{
				role: "tool",
				content: "y".repeat(15000),
				toolCallId: "tc2",
				timestamp: Date.now(),
			},
		];

		const l1 = new ToolResultBudget(DEFAULT_COMPACTION_CONFIG);
		const result = l1.compact(messages);

		expect(result.messages[0].content).toBe("hello");
		expect(result.messages[1].content).toBe("hi");
		expect(result.messages[2].content.length).toBeLessThan(15000);
	});

	it("adds truncation marker to truncated results", () => {
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "a".repeat(20000),
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];

		const l1 = new ToolResultBudget(DEFAULT_COMPACTION_CONFIG);
		const result = l1.compact(messages);

		expect(result.messages[0].content).toContain("[TRUNCATED]");
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/tool-result-budget.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement ToolResultBudget**

`packages/agent-runtime/src/compaction/tool-result-budget.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult } from "./types";

export class ToolResultBudget {
	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		let applied = false;
		const budget = this.config.toolResultBudget;
		const marker = "\n\n[TRUNCATED: tool result exceeded budget]";

		const compacted = messages.map((msg) => {
			if (msg.role !== "tool") return msg;
			if (msg.content.length <= budget) return msg;

			applied = true;
			return {
				...msg,
				content: msg.content.slice(0, budget) + marker,
			};
		});

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 1,
			name: "tool-result-budget",
			applied,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 5: Create compaction/index.ts shell**

`packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { ToolResultBudget } from "./tool-result-budget";
export type { CompactionConfig, CompactionLevelResult, CompactionHookMessage, CompactionProvider } from "./types";
export { DEFAULT_COMPACTION_CONFIG } from "./types";
```

- [ ] **Step 6: Update agent-runtime index.ts**

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { ToolResultBudget } from "./compaction/tool-result-budget";
export { DEFAULT_COMPACTION_CONFIG } from "./compaction/types";
export type { CompactionConfig, CompactionLevelResult, CompactionHookMessage, CompactionProvider } from "./compaction/types";
```

- [ ] **Step 7: Run L1 tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/tool-result-budget.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add compaction types and L1 tool-result-budget"
```

---

### Task 10: L2 Time Microcompact + L3 Cached Microcompact

**Files:**
- Create: `packages/agent-runtime/src/compaction/time-microcompact.ts`
- Create: `packages/agent-runtime/src/compaction/cached-microcompact.ts`
- Test: `packages/agent-runtime/test/compaction/time-microcompact.test.ts`
- Test: `packages/agent-runtime/test/compaction/cached-microcompact.test.ts`

- [ ] **Step 1: Write failing L2 time-microcompact tests**

`packages/agent-runtime/test/compaction/time-microcompact.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { TimeMicrocompact } from "@miniclaw/agent-runtime/compaction/time-microcompact";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L2: TimeMicrocompact", () => {
	it("removes tool results older than 1 hour", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "old result",
				toolCallId: "tc1",
				timestamp: now - 7200000,
			},
			{
				role: "user",
				content: "recent question",
				timestamp: now - 60000,
			},
			{
				role: "tool",
				content: "recent result",
				toolCallId: "tc2",
				timestamp: now - 60000,
			},
		];

		const l2 = new TimeMicrocompact(DEFAULT_COMPACTION_CONFIG);
		const result = l2.compact(messages, now);

		expect(result.applied).toBe(true);
		expect(result.messages.length).toBe(2);
		expect(result.messages.find((m) => m.content === "old result")).toBeUndefined();
		expect(result.messages.find((m) => m.content === "recent result")).toBeDefined();
	});

	it("does not remove anything when all tool results are fresh", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "fresh",
				toolCallId: "tc1",
				timestamp: now - 1000,
			},
		];

		const l2 = new TimeMicrocompact(DEFAULT_COMPACTION_CONFIG);
		const result = l2.compact(messages, now);

		expect(result.applied).toBe(false);
		expect(result.messages).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Write failing L3 cached-microcompact tests**

`packages/agent-runtime/test/compaction/cached-microcompact.test.ts`:
```typescript
import { describe, it, expect, vi } from "bun:test";
import { CachedMicrocompact } from "@miniclaw/agent-runtime/compaction/cached-microcompact";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L3: CachedMicrocompact", () => {
	it("deletes cached prefix tool results via API", async () => {
		const deleteFn = vi.fn(async (_prefix: string) => true);
		const now = Date.now();
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "cached_prefix_result",
				toolCallId: "tc1",
				timestamp: now - 1000,
			},
			{
				role: "tool",
				content: "non_cached_result",
				toolCallId: "tc2",
				timestamp: now - 1000,
			},
		];

		const l3 = new CachedMicrocompact(DEFAULT_COMPACTION_CONFIG, {
			deleteCachedPrefix: deleteFn,
			isCachedPrefix: (content: string) => content.startsWith("cached_prefix_"),
		});

		const result = l3.compact(messages);

		expect(result.applied).toBe(true);
		expect(deleteFn).toHaveBeenCalledWith("cached_prefix_result");
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].content).toBe("non_cached_result");
	});

	it("no-ops when no cached prefix results exist", () => {
		const deleteFn = vi.fn();
		const now = Date.now();
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "normal result",
				toolCallId: "tc1",
				timestamp: now,
			},
		];

		const l3 = new CachedMicrocompact(DEFAULT_COMPACTION_CONFIG, {
			deleteCachedPrefix: deleteFn,
			isCachedPrefix: () => false,
		});

		const result = l3.compact(messages);
		expect(result.applied).toBe(false);
		expect(deleteFn).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 3: Implement TimeMicrocompact**

`packages/agent-runtime/src/compaction/time-microcompact.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult } from "./types";

export class TimeMicrocompact {
	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[], now = Date.now()): CompactionLevelResult & { messages: AgentMessage[] } {
		const ageMs = this.config.timeMicrocompactAgeMs;
		let applied = false;

		const compacted = messages.filter((msg) => {
			if (msg.role !== "tool") return true;
			const age = now - msg.timestamp;
			if (age > ageMs) {
				applied = true;
				return false;
			}
			return true;
		});

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 2,
			name: "time-microcompact",
			applied,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 4: Implement CachedMicrocompact**

`packages/agent-runtime/src/compaction/cached-microcompact.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult } from "./types";

export interface CachedMicrocompactDeps {
	deleteCachedPrefix: (prefix: string) => Promise<boolean>;
	isCachedPrefix: (content: string) => boolean;
}

export class CachedMicrocompact {
	constructor(
		private config: CompactionConfig,
		private deps: CachedMicrocompactDeps,
	) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		let applied = false;
		const compacted: AgentMessage[] = [];

		for (const msg of messages) {
			if (msg.role === "tool" && this.deps.isCachedPrefix(msg.content)) {
				applied = true;
				this.deps.deleteCachedPrefix(msg.content);
				continue;
			}
			compacted.push(msg);
		}

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 3,
			name: "cached-microcompact",
			applied,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 5: Update compaction/index.ts and agent-runtime index.ts**

Add to `packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { TimeMicrocompact } from "./time-microcompact";
export { CachedMicrocompact } from "./cached-microcompact";
export type { CachedMicrocompactDeps } from "./cached-microcompact";
```

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { TimeMicrocompact } from "./compaction/time-microcompact";
export { CachedMicrocompact } from "./compaction/cached-microcompact";
export type { CachedMicrocompactDeps } from "./compaction/cached-microcompact";
```

- [ ] **Step 6: Run L2 + L3 tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add L2 time-microcompact and L3 cached-microcompact"
```

---

### Task 11: L4 History Snip

**Files:**
- Create: `packages/agent-runtime/src/compaction/history-snip.ts`
- Test: `packages/agent-runtime/test/compaction/history-snip.test.ts`

- [ ] **Step 1: Write failing L4 tests**

`packages/agent-runtime/test/compaction/history-snip.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { HistorySnip } from "@miniclaw/agent-runtime/compaction/history-snip";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L4: HistorySnip", () => {
	it("deletes the oldest round-group of messages", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{ role: "user", content: "first question", timestamp: now - 30000 },
			{ role: "assistant", content: "first answer", timestamp: now - 29000 },
			{ role: "user", content: "second question", timestamp: now - 20000 },
			{ role: "assistant", content: "second answer", timestamp: now - 19000 },
			{ role: "user", content: "third question", timestamp: now - 10000 },
			{ role: "assistant", content: "third answer", timestamp: now - 9000 },
		];

		const l4 = new HistorySnip(DEFAULT_COMPACTION_CONFIG);
		const result = l4.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.messages.length).toBe(4);
		expect(result.messages[0].content).toBe("second question");
		expect(result.messages.find((m) => m.content === "first question")).toBeUndefined();
	});

	it("does not snip when only one round-group remains", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{ role: "user", content: "only question", timestamp: now },
			{ role: "assistant", content: "only answer", timestamp: now },
		];

		const l4 = new HistorySnip(DEFAULT_COMPACTION_CONFIG);
		const result = l4.compact(messages);

		expect(result.applied).toBe(false);
		expect(result.messages).toHaveLength(2);
	});
});
```

- [ ] **Step 2: Implement HistorySnip**

`packages/agent-runtime/src/compaction/history-snip.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult } from "./types";

/**
 * Groups messages into "round-groups": each group starts with a user message
 * and includes subsequent assistant/tool messages until the next user message.
 */
function groupRounds(messages: AgentMessage[]): AgentMessage[][] {
	const groups: AgentMessage[][] = [];
	let current: AgentMessage[] = [];

	for (const msg of messages) {
		if (msg.role === "user" && current.length > 0) {
			groups.push(current);
			current = [];
		}
		current.push(msg);
	}

	if (current.length > 0) {
		groups.push(current);
	}

	return groups;
}

export class HistorySnip {
	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		const groups = groupRounds(messages);

		if (groups.length <= 1) {
			return {
				level: 4,
				name: "history-snip",
				applied: false,
				tokensBefore: this.estimateTokens(messages),
				tokensAfter: this.estimateTokens(messages),
				tokensFreed: 0,
				messages,
			};
		}

		const snipCount = Math.min(this.config.historySnipGroups, groups.length - 1);
		const remaining = groups.slice(snipCount);
		const compacted = remaining.flat();

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 4,
			name: "history-snip",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 3: Update exports and run tests**

Add to `packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { HistorySnip } from "./history-snip";
```

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { HistorySnip } from "./compaction/history-snip";
```

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/history-snip.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add L4 history-snip compaction"
```

---

### Task 12: L5 Context Collapse (Stage/Arm/Commit + projectView)

**Files:**
- Create: `packages/agent-runtime/src/compaction/context-collapse.ts`
- Test: `packages/agent-runtime/test/compaction/context-collapse.test.ts`

This is the most complex compaction level. It implements:
- An independent ContextStore separate from message history
- Stage (mutable scratchpad) / Arm (branch from stage) / Commit (freeze arm into projectView) lifecycle
- projectView: a compressed replay view that replaces full history

- [ ] **Step 1: Write failing L5 tests**

`packages/agent-runtime/test/compaction/context-collapse.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { ContextCollapse } from "@miniclaw/agent-runtime/compaction/context-collapse";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L5: ContextCollapse", () => {
	it("collapses history into a projectView summary when token overflow remains", () => {
		const now = Date.now();
		const messages: AgentMessage[] = Array.from({ length: 50 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Message ${i}: ${"x".repeat(500)}`,
			timestamp: now - (50 - i) * 1000,
		}));

		const l5 = new ContextCollapse(DEFAULT_COMPACTION_CONFIG);
		const result = l5.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(5);
		expect(result.messages.length).toBeLessThan(messages.length);
		// First message should be the projectView summary
		expect(result.messages[0].role).toBe("system");
		expect(result.messages[0].content).toContain("[Context Collapse]");
	});

	it("preserves most recent messages in collapsed view", () => {
		const now = Date.now();
		const messages: AgentMessage[] = Array.from({ length: 30 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Round ${i}: ${"y".repeat(300)}`,
			timestamp: now - (30 - i) * 1000,
		}));

		const l5 = new ContextCollapse(DEFAULT_COMPACTION_CONFIG);
		const result = l5.compact(messages);

		// Recent messages should survive
		const recent = result.messages.filter(
			(m) => m.content.includes("Round 28") || m.content.includes("Round 29"),
		);
		expect(recent.length).toBeGreaterThan(0);
	});

	it("Stage/Arm/Commit lifecycle works", () => {
		const l5 = new ContextCollapse(DEFAULT_COMPACTION_CONFIG);
		const stage = l5.createStage("initial context");
		const arm = l5.createArm(stage.id, "exploration branch");
		l5.commitArm(arm.id, "merged exploration");

		const view = l5.getProjectView();
		expect(view).toContain("merged exploration");
	});
});
```

- [ ] **Step 2: Implement ContextCollapse**

`packages/agent-runtime/src/compaction/context-collapse.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult } from "./types";

export interface Stage {
	id: string;
	content: string;
	createdAt: number;
}

export interface Arm {
	id: string;
	stageId: string;
	content: string;
	committed: boolean;
	commitMessage?: string;
	createdAt: number;
}

export class ContextCollapse {
	private stages = new Map<string, Stage>();
	private arms = new Map<string, Arm>();
	private commits: Array<{ message: string; timestamp: number }> = [];

	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		// Heuristic: if >20 messages and L1-L4 didn't resolve overflow,
		// collapse older history into a projectView summary
		if (messages.length <= 20) {
			return {
				level: 5,
				name: "context-collapse",
				applied: false,
				tokensBefore: this.estimateTokens(messages),
				tokensAfter: this.estimateTokens(messages),
				tokensFreed: 0,
				messages,
			};
		}

		// Split: keep last 8 messages, summarize the rest
		const recentCount = 8;
		const olderMessages = messages.slice(0, -recentCount);
		const recentMessages = messages.slice(-recentCount);

		// Build projectView summary from older messages
		const roundSummaries = this.summarizeRounds(olderMessages);
		const projectView = `[Context Collapse] The following rounds were collapsed:\n${roundSummaries}\n[End of collapsed context]`;

		const collapseMessage: AgentMessage = {
			role: "system",
			content: projectView,
			timestamp: Date.now(),
		};

		const compacted = [collapseMessage, ...recentMessages];
		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 5,
			name: "context-collapse",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	createStage(content: string): Stage {
		const stage: Stage = {
			id: crypto.randomUUID(),
			content,
			createdAt: Date.now(),
		};
		this.stages.set(stage.id, stage);
		return stage;
	}

	createArm(stageId: string, content: string): Arm {
		if (!this.stages.has(stageId)) {
			throw new Error(`Stage not found: ${stageId}`);
		}
		const arm: Arm = {
			id: crypto.randomUUID(),
			stageId,
			content,
			committed: false,
			createdAt: Date.now(),
		};
		this.arms.set(arm.id, arm);
		return arm;
	}

	commitArm(armId: string, commitMessage: string): void {
		const arm = this.arms.get(armId);
		if (!arm) throw new Error(`Arm not found: ${armId}`);
		arm.committed = true;
		arm.commitMessage = commitMessage;
		this.commits.push({ message: commitMessage, timestamp: Date.now() });
	}

	getProjectView(): string {
		const parts: string[] = [];
		for (const stage of this.stages.values()) {
			parts.push(`[Stage] ${stage.content}`);
		}
		for (const arm of this.arms.values()) {
			if (arm.committed) {
				parts.push(`[Committed Arm] ${arm.commitMessage}`);
			} else {
				parts.push(`[Active Arm] ${arm.content}`);
			}
		}
		return parts.join("\n");
	}

	private summarizeRounds(messages: AgentMessage[]): string {
		const groups: string[] = [];
		let current = "";

		for (const msg of messages) {
			if (msg.role === "user") {
				if (current) groups.push(current);
				current = `User asked: ${msg.content.slice(0, 100)}`;
			} else if (msg.role === "assistant") {
				current += ` | Assistant: ${msg.content.slice(0, 100)}`;
			} else if (msg.role === "tool") {
				current += ` | Tool: ${msg.content.slice(0, 50)}...`;
			}
		}
		if (current) groups.push(current);

		return groups.join("\n");
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 3: Update exports**

Add to `packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { ContextCollapse } from "./context-collapse";
export type { Stage, Arm } from "./context-collapse";
```

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { ContextCollapse } from "./compaction/context-collapse";
export type { Stage, Arm } from "./compaction/context-collapse";
```

- [ ] **Step 4: Run L5 tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/context-collapse.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add L5 context-collapse with Stage/Arm/Commit lifecycle"
```

---

### Task 13: L6 SM-compact (Semantic Compact via LLM Summary + Memory Hook)

**Files:**
- Create: `packages/agent-runtime/src/compaction/sm-compact.ts`
- Test: `packages/agent-runtime/test/compaction/sm-compact.test.ts`

L6 uses LLM to produce a semantic summary. It fires `onCompactionHookMessages` before and after compaction. Memory plugin listens and flushes persistent notes. Zero import of Memory module.

- [ ] **Step 1: Write failing L6 tests**

`packages/agent-runtime/test/compaction/sm-compact.test.ts`:
```typescript
import { describe, it, expect, vi } from "bun:test";
import { SMCompact } from "@miniclaw/agent-runtime/compaction/sm-compact";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import type { CompactionHookMessage } from "@miniclaw/agent-runtime/compaction/types";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L6: SM-compact", () => {
	it("calls LLM to summarize conversation and replaces history with summary", async () => {
		const mockSummary = "This conversation was about testing the compaction pipeline.";
		const chatFn = vi.fn(async () => ({ text: mockSummary, model: "test", usage: { inputTokens: 100, outputTokens: 50 } }));
		const hookMessages: CompactionHookMessage[] = [];

		const l6 = new SMCompact(DEFAULT_COMPACTION_CONFIG, {
			chatFn,
			fireHook: (msg: CompactionHookMessage) => hookMessages.push(msg),
		});

		const messages: AgentMessage[] = Array.from({ length: 20 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Round ${i} content with some detail`,
			timestamp: Date.now() - (20 - i) * 1000,
		}));

		const result = await l6.compact(messages, "session-1");

		expect(result.applied).toBe(true);
		expect(result.messages.length).toBeLessThan(messages.length);
		expect(result.messages[0].content).toContain("Round 0");
		expect(chatFn).toHaveBeenCalledTimes(1);
	});

	it("fires before and after hook messages", async () => {
		const chatFn = vi.fn(async () => ({ text: "summary", model: "test" }));
		const hookMessages: CompactionHookMessage[] = [];

		const l6 = new SMCompact(DEFAULT_COMPACTION_CONFIG, {
			chatFn,
			fireHook: (msg: CompactionHookMessage) => hookMessages.push(msg),
		});

		const messages: AgentMessage[] = Array.from({ length: 20 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Message ${i}`,
			timestamp: Date.now(),
		}));

		await l6.compact(messages, "session-2");

		expect(hookMessages).toHaveLength(2);
		expect(hookMessages[0].phase).toBe("before");
		expect(hookMessages[1].phase).toBe("after");
		expect(hookMessages[0].sessionId).toBe("session-2");
	});

	it("does not compact when message count is small", async () => {
		const chatFn = vi.fn();
		const l6 = new SMCompact(DEFAULT_COMPACTION_CONFIG, {
			chatFn,
			fireHook: () => {},
		});

		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: Date.now() },
			{ role: "assistant", content: "hello", timestamp: Date.now() },
		];

		const result = await l6.compact(messages, "session-3");
		expect(result.applied).toBe(false);
		expect(chatFn).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Implement SMCompact**

`packages/agent-runtime/src/compaction/sm-compact.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult, CompactionHookMessage } from "./types";
import type { LLMResponse } from "@miniclaw/plugin-api";

export interface SMCompactDeps {
	chatFn: (prompt: string, systemPrompt?: string) => Promise<LLMResponse>;
	fireHook: (msg: CompactionHookMessage) => void;
}

const MIN_MESSAGES_FOR_SM_COMPACT = 10;
const KEEP_RECENT_COUNT = 4;

export class SMCompact {
	constructor(
		private config: CompactionConfig,
		private deps: SMCompactDeps,
	) {}

	async compact(messages: AgentMessage[], sessionId: string): Promise<CompactionLevelResult & { messages: AgentMessage[] }> {
		if (messages.length < MIN_MESSAGES_FOR_SM_COMPACT) {
			const tokens = this.estimateTokens(messages);
			return {
				level: 6,
				name: "sm-compact",
				applied: false,
				tokensBefore: tokens,
				tokensAfter: tokens,
				tokensFreed: 0,
				messages,
			};
		}

		// Fire before hook
		this.deps.fireHook({
			type: "onCompactionHookMessages",
			phase: "before",
			level: 6,
			sessionId,
			deletedMessageCount: messages.length - KEEP_RECENT_COUNT,
		});

		// Split into older and recent
		const olderMessages = messages.slice(0, -KEEP_RECENT_COUNT);
		const recentMessages = messages.slice(-KEEP_RECENT_COUNT);

		// Build LLM summarization prompt
		const conversationText = olderMessages
			.map((m) => `${m.role}: ${m.content}`)
			.join("\n");

		const summaryPrompt = `Summarize the following conversation, preserving key decisions, user preferences, and important context. Be concise but complete:\n\n${conversationText}`;

		const response = await this.deps.chatFn(summaryPrompt, "You are a conversation summarizer. Produce a concise but complete summary.");

		// Build compacted message list
		const summaryMessage: AgentMessage = {
			role: "system",
			content: `[SM-compact Summary]\n${response.text}\n[End of summary]`,
			timestamp: Date.now(),
		};

		const compacted = [summaryMessage, ...recentMessages];
		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		// Fire after hook
		this.deps.fireHook({
			type: "onCompactionHookMessages",
			phase: "after",
			level: 6,
			sessionId,
			deletedMessageCount: olderMessages.length,
			summary: response.text,
		});

		return {
			level: 6,
			name: "sm-compact",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: compacted,
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 3: Update exports**

Add to `packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { SMCompact } from "./sm-compact";
export type { SMCompactDeps } from "./sm-compact";
```

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { SMCompact } from "./compaction/sm-compact";
export type { SMCompactDeps } from "./compaction/sm-compact";
```

- [ ] **Step 4: Run L6 tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/sm-compact.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add L6 SM-compact with LLM summary and onCompactionHookMessages"
```

---

### Task 14: L7 Legacy Compact (Full Conversation Summary via Forked Agent)

**Files:**
- Create: `packages/agent-runtime/src/compaction/legacy-compact.ts`
- Test: `packages/agent-runtime/test/compaction/legacy-compact.test.ts`

L7 is the last resort. It forks a background agent that reads the entire conversation and produces a comprehensive summary, replacing all messages with a single system message containing that summary. Also fires before/after hooks.

- [ ] **Step 1: Write failing L7 tests**

`packages/agent-runtime/test/compaction/legacy-compact.test.ts`:
```typescript
import { describe, it, expect, vi } from "bun:test";
import { LegacyCompact } from "@miniclaw/agent-runtime/compaction/legacy-compact";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import type { CompactionHookMessage } from "@miniclaw/agent-runtime/compaction/types";
import { DEFAULT_COMPACTION_CONFIG } from "@miniclaw/agent-runtime/compaction/types";

describe("L7: LegacyCompact", () => {
	it("replaces entire conversation with a single summary from forked agent", async () => {
		const summary = "Comprehensive summary of the entire conversation covering all topics.";
		const forkFn = vi.fn(async () => summary);

		const hookMessages: CompactionHookMessage[] = [];
		const l7 = new LegacyCompact(DEFAULT_COMPACTION_CONFIG, {
			forkFn,
			fireHook: (msg: CompactionHookMessage) => hookMessages.push(msg),
		});

		const messages: AgentMessage[] = Array.from({ length: 40 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Long message ${i} with lots of detail and context about various topics`,
			timestamp: Date.now() - (40 - i) * 1000,
		}));

		const result = await l7.compact(messages, "session-final");

		expect(result.applied).toBe(true);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].role).toBe("system");
		expect(result.messages[0].content).toContain("Comprehensive summary");
		expect(forkFn).toHaveBeenCalledTimes(1);
	});

	it("fires before and after hooks", async () => {
		const forkFn = vi.fn(async () => "summary");
		const hookMessages: CompactionHookMessage[] = [];

		const l7 = new LegacyCompact(DEFAULT_COMPACTION_CONFIG, {
			forkFn,
			fireHook: (msg: CompactionHookMessage) => hookMessages.push(msg),
		});

		const messages: AgentMessage[] = Array.from({ length: 20 }, (_, i) => ({
			role: "user" as const,
			content: `msg ${i}`,
			timestamp: Date.now(),
		}));

		await l7.compact(messages, "session-hooks");

		expect(hookMessages).toHaveLength(2);
		expect(hookMessages[0].phase).toBe("before");
		expect(hookMessages[1].phase).toBe("after");
	});

	it("does not apply when conversation is already small", async () => {
		const forkFn = vi.fn();
		const l7 = new LegacyCompact(DEFAULT_COMPACTION_CONFIG, {
			forkFn,
			fireHook: () => {},
		});

		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: Date.now() },
		];

		const result = await l7.compact(messages, "small-session");
		expect(result.applied).toBe(false);
		expect(forkFn).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Implement LegacyCompact**

`packages/agent-runtime/src/compaction/legacy-compact.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult, CompactionHookMessage } from "./types";

export interface LegacyCompactDeps {
	forkFn: (conversationText: string) => Promise<string>;
	fireHook: (msg: CompactionHookMessage) => void;
}

const MIN_MESSAGES_FOR_LEGACY = 10;

export class LegacyCompact {
	constructor(
		private config: CompactionConfig,
		private deps: LegacyCompactDeps,
	) {}

	async compact(messages: AgentMessage[], sessionId: string): Promise<CompactionLevelResult & { messages: AgentMessage[] }> {
		if (messages.length < MIN_MESSAGES_FOR_LEGACY) {
			const tokens = this.estimateTokens(messages);
			return {
				level: 7,
				name: "legacy-compact",
				applied: false,
				tokensBefore: tokens,
				tokensAfter: tokens,
				tokensFreed: 0,
				messages,
			};
		}

		// Fire before hook
		this.deps.fireHook({
			type: "onCompactionHookMessages",
			phase: "before",
			level: 7,
			sessionId,
			deletedMessageCount: messages.length,
		});

		// Build full conversation text for forked agent
		const conversationText = messages
			.map((m) => `${m.role}: ${m.content}`)
			.join("\n");

		// Fork agent to produce comprehensive summary
		const summary = await this.deps.forkFn(conversationText);

		// Replace entire history with single summary message
		const summaryMessage: AgentMessage = {
			role: "system",
			content: `[Legacy Compact — Full Conversation Summary]\n${summary}\n[End of legacy summary]`,
			timestamp: Date.now(),
		};

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens([summaryMessage]);

		// Fire after hook
		this.deps.fireHook({
			type: "onCompactionHookMessages",
			phase: "after",
			level: 7,
			sessionId,
			deletedMessageCount: messages.length,
			summary,
		});

		return {
			level: 7,
			name: "legacy-compact",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: [summaryMessage],
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 3: Update exports**

Add to `packages/agent-runtime/src/compaction/index.ts`:
```typescript
export { LegacyCompact } from "./legacy-compact";
export type { LegacyCompactDeps } from "./legacy-compact";
```

Add to `packages/agent-runtime/src/index.ts`:
```typescript
export { LegacyCompact } from "./compaction/legacy-compact";
export type { LegacyCompactDeps } from "./compaction/legacy-compact";
```

- [ ] **Step 4: Run L7 tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/legacy-compact.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add L7 legacy-compact with forked agent summary and hooks"
```

---

### Task 15: Compaction Pipeline Orchestrator

**Files:**
- Create: `packages/agent-runtime/src/compaction/index.ts` (rewrite as orchestrator)
- Test: `packages/agent-runtime/test/compaction/pipeline.test.ts`

The pipeline runs L1 through L7 sequentially. Each level only acts if the previous level didn't resolve the token overflow. It uses the actual estimated token count vs. `maxTokens` from config.

- [ ] **Step 1: Write failing pipeline tests**

`packages/agent-runtime/test/compaction/pipeline.test.ts`:
```typescript
import { describe, it, expect, vi } from "bun:test";
import { CompactionPipeline } from "@miniclaw/agent-runtime/compaction";
import type { AgentMessage } from "@miniclaw/agent-runtime";
import type { CompactionHookMessage } from "@miniclaw/agent-runtime/compaction/types";

describe("CompactionPipeline", () => {
	it("applies L1 when tool results exceed budget", async () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "read this file", timestamp: Date.now() },
			{
				role: "tool",
				content: "x".repeat(20000),
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];

		const pipeline = new CompactionPipeline({
			maxTokens: 128000,
			toolResultBudget: 10000,
			timeMicrocompactAgeMs: 3600000,
			historySnipGroups: 1,
			smCompactTargetRatio: 0.5,
		});

		const result = await pipeline.run(messages, "s1");

		expect(result.levels.some((l) => l.level === 1 && l.applied)).toBe(true);
		expect(result.messages.some((m) => m.content.includes("[TRUNCATED]"))).toBe(true);
	});

	it("escalates to L4 when L1-L3 don't resolve overflow", async () => {
		const now = Date.now();
		const messages: AgentMessage[] = Array.from({ length: 60 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Round ${i}: ${"z".repeat(5000)}`,
			timestamp: now - (60 - i) * 1000,
		}));

		const pipeline = new CompactionPipeline({
			maxTokens: 10000,
			toolResultBudget: 50000,
			timeMicrocompactAgeMs: 3600000,
			historySnipGroups: 1,
			smCompactTargetRatio: 0.5,
		});

		const result = await pipeline.run(messages, "s2");
		// L1-L3 won't help (no tool results, all recent), so L4 should fire
		expect(result.levels.some((l) => l.level >= 4 && l.applied)).toBe(true);
	});

	it("escalates to L7 as last resort", async () => {
		const now = Date.now();
		const messages: AgentMessage[] = Array.from({ length: 100 }, (_, i) => ({
			role: i % 2 === 0 ? "user" as const : "assistant" as const,
			content: `Message ${i}: ${"w".repeat(8000)}`,
			timestamp: now - (100 - i) * 1000,
		}));

		const pipeline = new CompactionPipeline({
			maxTokens: 5000,
			toolResultBudget: 50000,
			timeMicrocompactAgeMs: 3600000,
			historySnipGroups: 5,
			smCompactTargetRatio: 0.5,
		});

		// Provide mock chatFn for L6, forkFn for L7
		pipeline.setLLMChatFn(async () => ({ text: "Summary", model: "test", usage: { inputTokens: 1, outputTokens: 1 } }));
		pipeline.setForkFn(async () => "Full conversation summary");

		const result = await pipeline.run(messages, "s3");
		expect(result.messages.length).toBeLessThan(messages.length);
		expect(result.finalTokens).toBeLessThanOrEqual(5000 * 2);
	});

	it("stops early when level resolves overflow", async () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: Date.now() },
			{
				role: "tool",
				content: "a".repeat(20000),
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];

		const pipeline = new CompactionPipeline({
			maxTokens: 128000,
			toolResultBudget: 10000,
			timeMicrocompactAgeMs: 3600000,
			historySnipGroups: 1,
			smCompactTargetRatio: 0.5,
		});

		const result = await pipeline.run(messages, "s4");
		// L1 should resolve this, L2+ should not be applied
		expect(result.levels.filter((l) => l.applied).length).toBe(1);
	});
});
```

- [ ] **Step 2: Rewrite compaction/index.ts as pipeline orchestrator**

`packages/agent-runtime/src/compaction/index.ts`:
```typescript
import type { AgentMessage } from "../types";
import type { CompactionConfig, CompactionLevelResult, CompactionHookMessage } from "./types";
import { DEFAULT_COMPACTION_CONFIG } from "./types";
import { ToolResultBudget } from "./tool-result-budget";
import { TimeMicrocompact } from "./time-microcompact";
import { CachedMicrocompact } from "./cached-microcompact";
import { HistorySnip } from "./history-snip";
import { ContextCollapse } from "./context-collapse";
import { SMCompact } from "./sm-compact";
import type { SMCompactDeps } from "./sm-compact";
import { LegacyCompact } from "./legacy-compact";
import type { LegacyCompactDeps } from "./legacy-compact";

export interface PipelineResult {
	messages: AgentMessage[];
	levels: CompactionLevelResult[];
	initialTokens: number;
	finalTokens: number;
	hooks: CompactionHookMessage[];
}

export class CompactionPipeline {
	private config: CompactionConfig;
	private chatFn: SMCompactDeps["chatFn"] | null = null;
	private forkFn: LegacyCompactDeps["forkFn"] | null = null;
	private hooks: CompactionHookMessage[] = [];

	constructor(config: Partial<CompactionConfig> = {}) {
		this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
	}

	setLLMChatFn(fn: SMCompactDeps["chatFn"]): void {
		this.chatFn = fn;
	}

	setForkFn(fn: LegacyCompactDeps["forkFn"]): void {
		this.forkFn = fn;
	}

	async run(messages: AgentMessage[], sessionId: string): Promise<PipelineResult> {
		this.hooks = [];
		const fireHook = (msg: CompactionHookMessage) => this.hooks.push(msg);

		const initialTokens = this.estimateTokens(messages);
		let currentMessages = [...messages];
		const levelResults: CompactionLevelResult[] = [];

		// L1: Tool Result Budget
		const l1 = new ToolResultBudget(this.config);
		const r1 = l1.compact(currentMessages);
		levelResults.push(r1);
		currentMessages = r1.messages;
		if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
			return this.buildResult(currentMessages, levelResults, initialTokens);
		}

		// L2: Time Microcompact
		const l2 = new TimeMicrocompact(this.config);
		const r2 = l2.compact(currentMessages);
		levelResults.push(r2);
		currentMessages = r2.messages;
		if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
			return this.buildResult(currentMessages, levelResults, initialTokens);
		}

		// L3: Cached Microcompact (no-op if no deps configured)
		if (this.config) {
			const l3 = new CachedMicrocompact(this.config, {
				deleteCachedPrefix: async () => false,
				isCachedPrefix: () => false,
			});
			const r3 = l3.compact(currentMessages);
			levelResults.push(r3);
			currentMessages = r3.messages;
			if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
				return this.buildResult(currentMessages, levelResults, initialTokens);
			}
		}

		// L4: History Snip
		const l4 = new HistorySnip(this.config);
		const r4 = l4.compact(currentMessages);
		levelResults.push(r4);
		currentMessages = r4.messages;
		if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
			return this.buildResult(currentMessages, levelResults, initialTokens);
		}

		// L5: Context Collapse
		const l5 = new ContextCollapse(this.config);
		const r5 = l5.compact(currentMessages);
		levelResults.push(r5);
		currentMessages = r5.messages;
		if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
			return this.buildResult(currentMessages, levelResults, initialTokens);
		}

		// L6: SM-compact (requires LLM)
		if (this.chatFn) {
			const l6 = new SMCompact(this.config, { chatFn: this.chatFn, fireHook });
			const r6 = await l6.compact(currentMessages, sessionId);
			levelResults.push(r6);
			currentMessages = r6.messages;
			if (this.estimateTokens(currentMessages) <= this.config.maxTokens) {
				return this.buildResult(currentMessages, levelResults, initialTokens);
			}
		}

		// L7: Legacy compact (last resort, requires forkFn)
		if (this.forkFn) {
			const l7 = new LegacyCompact(this.config, { forkFn: this.forkFn, fireHook });
			const r7 = await l7.compact(currentMessages, sessionId);
			levelResults.push(r7);
			currentMessages = r7.messages;
		}

		return this.buildResult(currentMessages, levelResults, initialTokens);
	}

	private buildResult(
		messages: AgentMessage[],
		levels: CompactionLevelResult[],
		initialTokens: number,
	): PipelineResult {
		return {
			messages,
			levels,
			initialTokens,
			finalTokens: this.estimateTokens(messages),
			hooks: [...this.hooks],
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}

// Re-export all compaction components
export { ToolResultBudget } from "./tool-result-budget";
export { TimeMicrocompact } from "./time-microcompact";
export { CachedMicrocompact } from "./cached-microcompact";
export { HistorySnip } from "./history-snip";
export { ContextCollapse } from "./context-collapse";
export { SMCompact } from "./sm-compact";
export { LegacyCompact } from "./legacy-compact";
export type { SMCompactDeps } from "./sm-compact";
export type { LegacyCompactDeps } from "./legacy-compact";
export type { CompactionConfig, CompactionLevelResult, CompactionHookMessage, CompactionProvider } from "./types";
export { DEFAULT_COMPACTION_CONFIG } from "./types";
```

- [ ] **Step 3: Update agent-runtime/src/index.ts**

Replace compaction-related exports with:
```typescript
export { CompactionPipeline, ToolResultBudget, TimeMicrocompact, CachedMicrocompact, HistorySnip, ContextCollapse, SMCompact, LegacyCompact, DEFAULT_COMPACTION_CONFIG } from "./compaction";
export type { CompactionConfig, CompactionLevelResult, CompactionHookMessage, CompactionProvider, SMCompactDeps, LegacyCompactDeps, PipelineResult } from "./compaction";
export type { CachedMicrocompactDeps } from "./compaction/cached-microcompact";
export type { Stage, Arm } from "./compaction/context-collapse";
```

- [ ] **Step 4: Run pipeline tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/pipeline.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run all compaction tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/compaction/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): add CompactionPipeline orchestrator with L1-L7 escalation"
```

---

### Task 16: AgentRuntime Core Loop

**Files:**
- Rewrite: `packages/agent-runtime/src/index.ts`
- Test: `packages/agent-runtime/test/agent-runtime.test.ts`

The core agentic loop: Prompt Assembly → LLM → Tool Execution → Reply. Loops until the LLM returns `end_turn` (no tool calls).

- [ ] **Step 1: Write failing agent-runtime tests**

`packages/agent-runtime/test/agent-runtime.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "bun:test";
import { AgentRuntime } from "@miniclaw/agent-runtime";
import type { AgentMessage, ToolDefinition, LLMResponse } from "@miniclaw/agent-runtime";
import type { CompactionPipeline } from "@miniclaw/agent-runtime/compaction";

describe("AgentRuntime", () => {
	it("runs single-turn loop: prompt → LLM → reply (no tools)", async () => {
		const chatFn = vi.fn(async () => ({
			text: "Hello! How can I help?",
			model: "test",
			toolCalls: undefined,
		}));

		const runtime = new AgentRuntime({
			chatFn,
			baseSystemPrompt: "You are helpful.",
			tools: [],
			compactionConfig: { maxTokens: 128000, toolResultBudget: 10000, timeMicrocompactAgeMs: 3600000, historySnipGroups: 1, smCompactTargetRatio: 0.5 },
		});

		const replies: string[] = [];
		runtime.onReply((text) => replies.push(text));

		const messages: AgentMessage[] = [
			{ role: "user", content: "Hi there", timestamp: Date.now() },
		];

		await runtime.run(messages, "session-1");

		expect(chatFn).toHaveBeenCalledTimes(1);
		expect(replies).toContain("Hello! How can I help?");
	});

	it("runs multi-turn loop with tool calls", async () => {
		const echoTool: ToolDefinition = {
			name: "echo",
			description: "Echo input",
			parameters: { type: "object", properties: { text: { type: "string" } } },
			execute: async (args) => `Echo: ${args.text}`,
		};

		let callCount = 0;
		const chatFn = vi.fn(async () => {
			callCount++;
			if (callCount === 1) {
				return {
					text: "",
					model: "test",
					toolCalls: [{ id: "tc1", name: "echo", arguments: JSON.stringify({ text: "hello" }) }],
				};
			}
			return { text: "Done echoing", model: "test", toolCalls: undefined };
		});

		const runtime = new AgentRuntime({
			chatFn,
			baseSystemPrompt: "You are helpful.",
			tools: [echoTool],
			compactionConfig: { maxTokens: 128000, toolResultBudget: 10000, timeMicrocompactAgeMs: 3600000, historySnipGroups: 1, smCompactTargetRatio: 0.5 },
		});

		const replies: string[] = [];
		runtime.onReply((text) => replies.push(text));

		await runtime.run([{ role: "user", content: "echo hello", timestamp: Date.now() }], "session-2");

		expect(chatFn).toHaveBeenCalledTimes(2);
		expect(replies).toContain("Done echoing");
	});

	it("triggers compaction when token count exceeds max", async () => {
		const chatFn = vi.fn(async () => ({
			text: "ok",
			model: "test",
		}));

		const compactFn = vi.fn(async (msgs: AgentMessage[]) => msgs);

		const runtime = new AgentRuntime({
			chatFn,
			baseSystemPrompt: "You are helpful.",
			tools: [],
			compactionConfig: { maxTokens: 100, toolResultBudget: 10000, timeMicrocompactAgeMs: 3600000, historySnipGroups: 1, smCompactTargetRatio: 0.5 },
			compactFn,
		});

		const bigMessages: AgentMessage[] = [
			{ role: "user", content: "x".repeat(5000), timestamp: Date.now() },
		];

		await runtime.run(bigMessages, "session-3");
		expect(compactFn).toHaveBeenCalled();
	});

	it("emits streaming chunks", async () => {
		const chatFn = vi.fn(async function* () {
			yield "Hello ";
			yield "world!";
		});

		const runtime = new AgentRuntime({
			chatFn,
			baseSystemPrompt: "You are helpful.",
			tools: [],
			compactionConfig: { maxTokens: 128000, toolResultBudget: 10000, timeMicrocompactAgeMs: 3600000, historySnipGroups: 1, smCompactTargetRatio: 0.5 },
		});

		const chunks: string[] = [];
		runtime.onStreamChunk((chunk) => chunks.push(chunk));

		await runtime.run([{ role: "user", content: "hi", timestamp: Date.now() }], "session-4");

		expect(chunks.join("")).toContain("Hello world!");
	});

	it("respects abort signal", async () => {
		const chatFn = vi.fn(async () => new Promise(() => {}));

		const runtime = new AgentRuntime({
			chatFn,
			baseSystemPrompt: "You are helpful.",
			tools: [],
			compactionConfig: { maxTokens: 128000, toolResultBudget: 10000, timeMicrocompactAgeMs: 3600000, historySnipGroups: 1, smCompactTargetRatio: 0.5 },
		});

		const controller = new AbortController();
		const runPromise = runtime.run(
			[{ role: "user", content: "hi", timestamp: Date.now() }],
			"session-5",
			controller.signal,
		);

		controller.abort();
		await expect(runPromise).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Implement AgentRuntime class**

Replace `packages/agent-runtime/src/index.ts` with the full implementation. The AgentRuntime class ties together all components:

```typescript
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import type {
	AgentMessage,
	ToolDefinition,
	ToolExecutionContext,
	ToolCall,
	StreamChunk,
	CompactionConfig,
} from "./types";
import { PromptAssembler } from "./prompt-assembly";
import { ToolRegistry } from "./tool-execution";
import { StreamingEngine } from "./streaming-engine";
import { CircuitBreaker } from "./circuit-breaker";
import { CompactionPipeline } from "./compaction";
import type { PipelineResult } from "./compaction";
import { DEFAULT_COMPACTION_CONFIG } from "./compaction/types";

export { CircuitBreaker } from "./circuit-breaker";
export { PromptAssembler } from "./prompt-assembly";
export type { PromptAssemblerConfig, AssembledPrompt, MemoryEntry, ToolDef } from "./prompt-assembly";
export { ToolRegistry } from "./tool-execution";
export { StreamingEngine } from "./streaming-engine";
export type { StreamingEngineConfig } from "./streaming-engine";
export { BashTool } from "./tools/bash";
export { ReadFileTool } from "./tools/read-file";
export { ListFilesTool } from "./tools/list-files";
export { SpawnSubAgentTool } from "./tools/spawn-sub-agent";
export type { SpawnFn } from "./tools/spawn-sub-agent";
export { LLMRouter } from "./llm-router";
export { FallbackChain } from "./llm-router/fallback-chain";
export type { ProviderLike } from "./llm-router/fallback-chain";
export { EmbedQueue } from "./llm-router/embed-queue";
export { AnthropicProvider } from "./llm-router/providers/anthropic";
export type { AnthropicProviderDeps } from "./llm-router/providers/anthropic";
export { OpenAIProvider } from "./llm-router/providers/openai";
export type { OpenAIProviderDeps } from "./llm-router/providers/openai";
export { GoogleProvider } from "./llm-router/providers/google";
export { BedrockProvider } from "./llm-router/providers/bedrock";
export { CompactionPipeline, ToolResultBudget, TimeMicrocompact, CachedMicrocompact, HistorySnip, ContextCollapse, SMCompact, LegacyCompact, DEFAULT_COMPACTION_CONFIG } from "./compaction";
export type { CompactionConfig, CompactionLevelResult, CompactionHookMessage, CompactionProvider, SMCompactDeps, LegacyCompactDeps, PipelineResult, CachedMicrocompactDeps } from "./compaction";
export type { Stage, Arm } from "./compaction/context-collapse";
export type {
	CircuitBreakerState,
	CircuitBreakerConfig,
	AgentMessage as ARAgentMessage,
	ToolCall as ARToolCall,
	ToolResult,
	ToolDefinition as ARToolDefinition,
	ToolExecutionContext as ARToolExecutionContext,
	LLMProviderConfig,
	AssembledPrompt as ARAssembledPrompt,
	CompactionResult,
	StreamChunk as ARStreamChunk,
	EmbedRequest,
} from "./types";

export interface AgentRuntimeConfig {
	chatFn: (messages: AgentMessage[], systemPrompt: string, signal?: AbortSignal) => Promise<LLMResponse & { toolCalls?: ToolCall[] }>;
	baseSystemPrompt: string;
	tools: ToolDefinition[];
	compactionConfig: Partial<CompactionConfig>;
	compactFn?: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
	maxIterations?: number;
	workingDir?: string;
	readOnly?: boolean;
}

export class AgentRuntime {
	private chatFn: AgentRuntimeConfig["chatFn"];
	private assembler: PromptAssembler;
	private toolRegistry: ToolRegistry;
	private compactionConfig: CompactionConfig;
	private compactFn: AgentRuntimeConfig["compactFn"];
	private maxIterations: number;
	private workingDir: string;
	private readOnly: boolean;
	private onReplyFn: ((text: string) => void) | null = null;
	private onStreamChunkFn: ((chunk: string) => void) | null = null;
	private onToolCallFn: ((toolCall: ToolCall, result: string) => void) | null = null;

	constructor(config: AgentRuntimeConfig) {
		this.chatFn = config.chatFn;
		this.assembler = new PromptAssembler({
			baseSystemPrompt: config.baseSystemPrompt,
			maxTokens: config.compactionConfig.maxTokens ?? DEFAULT_COMPACTION_CONFIG.maxTokens,
		});
		this.toolRegistry = new ToolRegistry();
		for (const tool of config.tools) {
			this.toolRegistry.register(tool);
		}
		this.compactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...config.compactionConfig };
		this.compactFn = config.compactFn;
		this.maxIterations = config.maxIterations ?? 50;
		this.workingDir = config.workingDir ?? process.cwd();
		this.readOnly = config.readOnly ?? true;
	}

	onReply(fn: (text: string) => void): void {
		this.onReplyFn = fn;
	}

	onStreamChunk(fn: (chunk: string) => void): void {
		this.onStreamChunkFn = fn;
	}

	onToolCall(fn: (toolCall: ToolCall, result: string) => void): void {
		this.onToolCallFn = fn;
	}

	async run(messages: AgentMessage[], sessionId: string, signal?: AbortSignal): Promise<AgentMessage[]> {
		let currentMessages = [...messages];

		for (let i = 0; i < this.maxIterations; i++) {
			if (signal?.aborted) throw new Error("Aborted");

			// Check token budget and compact if needed
			const tokenEstimate = this.estimateTokens(currentMessages);
			if (tokenEstimate > this.compactionConfig.maxTokens) {
				if (this.compactFn) {
					currentMessages = await this.compactFn(currentMessages);
				}
			}

			// Assemble prompt
			const toolDefs = this.toolRegistry.getDefinitions();
			const assembled = this.assembler.assemble(currentMessages, toolDefs);

			// Call LLM
			const response = await this.chatFn(assembled.messages, assembled.systemPrompt, signal);

			// Emit reply text
			if (response.text) {
				this.onReplyFn?.(response.text);
				this.onStreamChunkFn?.(response.text);
			}

			// Add assistant message
			const assistantMsg: AgentMessage = {
				role: "assistant",
				content: response.text,
				timestamp: Date.now(),
			};
			if (response.toolCalls?.length) {
				assistantMsg.toolCalls = response.toolCalls;
			}
			currentMessages.push(assistantMsg);

			// If no tool calls, loop ends
			if (!response.toolCalls?.length) {
				break;
			}

			// Execute tool calls
			const ctx: ToolExecutionContext = {
				sessionId,
				workingDir: this.workingDir,
				readOnly: this.readOnly,
				enqueueReply: (content: string) => this.onReplyFn?.(content),
			};

			for (const tc of response.toolCalls) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(tc.arguments);
				} catch {
					args = {};
				}

				let result: string;
				try {
					result = await this.toolRegistry.execute(tc.name, args, ctx);
				} catch (err) {
					result = `Error: ${err instanceof Error ? err.message : String(err)}`;
				}

				this.onToolCallFn?.(tc, result);

				currentMessages.push({
					role: "tool",
					content: result,
					toolCallId: tc.id,
					timestamp: Date.now(),
				});
			}
		}

		return currentMessages;
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
```

- [ ] **Step 3: Run agent-runtime tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/test/agent-runtime.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Run ALL agent-runtime tests**

Run: `cd /mnt/d/miniclaw && bun test packages/agent-runtime/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/miniclaw && git add packages/agent-runtime/ && git commit -m "feat(agent-runtime): implement core agentic loop with prompt assembly, tool execution, compaction, and streaming"
```

---

## Spec Coverage Checklist

| Phase 2 Deliverable | Task | Artifact |
|---------------------|------|----------|
| Agent Runtime core loop | T16 | `packages/agent-runtime/src/index.ts` |
| LLM Router unified entry | T3 | `packages/agent-runtime/src/llm-router/index.ts` |
| Fallback chain + hot-swap | T3 | `packages/agent-runtime/src/llm-router/fallback-chain.ts` |
| Provider adapters (Anthropic, OpenAI, Google, Bedrock) | T2 | `packages/agent-runtime/src/llm-router/providers/*.ts` |
| Embed priority queue | T4 | `packages/agent-runtime/src/llm-router/embed-queue.ts` |
| Tool Registry | T5 | `packages/agent-runtime/src/tool-execution.ts` |
| bash tool (read-only default) | T5 | `packages/agent-runtime/src/tools/bash.ts` |
| read_file tool | T5 | `packages/agent-runtime/src/tools/read-file.ts` |
| list_files tool | T5 | `packages/agent-runtime/src/tools/list-files.ts` |
| spawn_sub_agent tool | T6 | `packages/agent-runtime/src/tools/spawn-sub-agent.ts` |
| Streaming Engine (SSE + sentence boundary) | T8 | `packages/agent-runtime/src/streaming-engine.ts` |
| Circuit Breaker (half-open, 10min probe, 2 recover) | T1 | `packages/agent-runtime/src/circuit-breaker.ts` |
| L1: Tool Result Budget | T9 | `packages/agent-runtime/src/compaction/tool-result-budget.ts` |
| L2: Time-based Microcompact | T10 | `packages/agent-runtime/src/compaction/time-microcompact.ts` |
| L3: Cached Microcompact | T10 | `packages/agent-runtime/src/compaction/cached-microcompact.ts` |
| L4: History Snip | T11 | `packages/agent-runtime/src/compaction/history-snip.ts` |
| L5: Context Collapse (Stage/Arm/Commit) | T12 | `packages/agent-runtime/src/compaction/context-collapse.ts` |
| L6: SM-compact (LLM + hooks) | T13 | `packages/agent-runtime/src/compaction/sm-compact.ts` |
| L7: Legacy compact (forked agent) | T14 | `packages/agent-runtime/src/compaction/legacy-compact.ts` |
| Compaction Pipeline orchestrator | T15 | `packages/agent-runtime/src/compaction/index.ts` |
| Prompt Assembly | T7 | `packages/agent-runtime/src/prompt-assembly.ts` |
| AgentRuntimeHost/Client interface | T16 | `AgentRuntime.run()` is the host entry point |

## Architecture Enforcement

- Gateway -> AR -> LLMRouter -> Provider: The `AgentRuntime` class is the only path. Gateway calls `runtime.run()`.
- Compaction is NOT a plugin: All 7 levels live in `packages/agent-runtime/src/compaction/`.
- Compaction-Memory decoupling: L6/L7 fire `onCompactionHookMessages` (before/after). Memory plugin listens. Zero import of Memory module.
- Error taxonomy: Uses `MiniclawError` hierarchy from `@miniclaw/plugin-api`.
- Streaming backpressure: `StreamingEngine.push()` returns `true` on overflow. Caller falls back to non-streaming.
- Embed queue priority: `session_chat > memory_search > rag_indexing` per D43.

## Week-by-Week Estimate (Single Developer)

| Week | Tasks | Scope |
|------|-------|-------|
| 1 | T1, T2, T3, T4 | Types, CircuitBreaker, LLM providers, Router, Fallback, Embed queue |
| 2 | T5, T6, T7 | Tool registry, bash/read_file/list_files/spawn_sub_agent, Prompt assembly |
| 3 | T8, T9 | Streaming engine, Compaction types + L1 |
| 4 | T10, T11 | L2 time-micro, L3 cached-micro, L4 history-snip |
| 5 | T12 | L5 context-collapse (most complex) |
| 6 | T13, T14 | L6 SM-compact, L7 legacy-compact |
| 7 | T15, T16 | Pipeline orchestrator, AgentRuntime core loop, integration |
| 8 | Buffer | Integration testing, edge cases, bug fixes |
