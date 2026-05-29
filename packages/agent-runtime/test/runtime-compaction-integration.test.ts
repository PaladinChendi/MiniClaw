import { describe, expect, it, vi } from "bun:test";
import { AgentRuntime } from "../src/agent-runtime.ts";
import { CompactionPipeline } from "../src/compaction/pipeline.ts";
import type { CompactionPipelineDeps } from "../src/compaction/pipeline.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../src/compaction/types.ts";
import type { CompactionConfig, CompactionLevelResult, CompactionResult } from "../src/compaction/types.ts";
import type { AgentMessage } from "../src/types.ts";

function makePipelineDeps(): CompactionPipelineDeps {
	return {
		cachedMicrocompact: {
			deleteCachedPrefix: vi.fn(async () => true),
			isCachedPrefix: () => false,
		},
		contextCollapse: {
			projectView: () => "Project: ebsclaw integration test",
		},
		smCompact: {
			summarizeWithLLM: vi.fn(async (msgs: AgentMessage[]) => `Summary of ${msgs.length} messages`),
			sessionId: "integration-session",
		},
		legacyCompact: {
			forkAndSummarize: vi.fn(async (msgs: AgentMessage[]) => `Full summary of ${msgs.length} messages`),
			sessionId: "integration-session",
		},
	};
}

function makeRuntimeConfig(overrides: Record<string, unknown> = {}) {
	return {
		chatFn: vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Done.",
			toolCalls: [],
			timestamp: Date.now(),
		})),
		baseSystemPrompt: "You are a helpful assistant.",
		tools: [],
		maxIterations: 10,
		workingDir: "/tmp",
		readOnly: false,
		...overrides,
	};
}

describe("AgentRuntime + CompactionPipeline integration", () => {
	// I-RC-01: Wire pipeline as compactFn, compaction triggers automatically during run()
	it("I-RC-01: Compaction triggers automatically during run() when wired as compactFn", async () => {
		const pipelineDeps = makePipelineDeps();
		const config: CompactionConfig = { ...DEFAULT_COMPACTION_CONFIG, maxTokens: 10 };
		const pipeline = new CompactionPipeline(config, pipelineDeps);

		const compactFn = vi.fn(async (msgs: AgentMessage[]) => {
			const result = await pipeline.compact(msgs);
			const last = result.results[result.results.length - 1];
			return {
				level: last?.level ?? 0,
				applied: result.totalTokensFreed > 0,
				tokensFreed: result.totalTokensFreed,
				summary:
					result.messages.length > 0 && result.messages[0].role === "system" ? result.messages[0].content : undefined,
			};
		});

		const config2 = makeRuntimeConfig({
			compactFn,
			compactionConfig: { maxTokens: 10 },
		});

		const runtime = new AgentRuntime(config2);
		await runtime.run([
			{
				role: "user",
				content:
					"This is a long message that definitely exceeds the very small maxTokens budget of 10 tokens that we configured for this integration test",
				timestamp: Date.now(),
			},
		]);

		expect(compactFn).toHaveBeenCalled();
	});

	// I-RC-02: L1 enough, no L2 — slightly over budget, verify only L1 runs
	it("I-RC-02: Only L1 runs when slightly over budget", async () => {
		const pipelineDeps = makePipelineDeps();
		const budget = 100;
		// Set maxTokens so that after L1 truncation the messages are under budget.
		// After truncation: tool message = budget + marker length, user message = "short".
		// Total ~120 chars = ~30 tokens. Set maxTokens low but above that.
		const config: CompactionConfig = {
			...DEFAULT_COMPACTION_CONFIG,
			toolResultBudget: budget,
			maxTokens: 50,
		};
		const pipeline = new CompactionPipeline(config, pipelineDeps);

		let capturedResult: {
			messages: AgentMessage[];
			results: CompactionLevelResult[];
			totalTokensFreed: number;
		} | null = null;
		const compactFn = vi.fn(async (msgs: AgentMessage[]) => {
			capturedResult = await pipeline.compact(msgs);
			const last = capturedResult.results[capturedResult.results.length - 1];
			return {
				level: last?.level ?? 0,
				applied: capturedResult.totalTokensFreed > 0,
				tokensFreed: capturedResult.totalTokensFreed,
				summary:
					capturedResult.messages.length > 0 && capturedResult.messages[0].role === "system"
						? capturedResult.messages[0].content
						: undefined,
			};
		});

		// Create messages that are over the 50-token budget but after L1 truncation are under.
		// A tool message with 800 chars = 200 tokens, plus a user message.
		const longToolContent = "X".repeat(800); // 200 tokens
		const config2 = makeRuntimeConfig({
			compactFn,
			compactionConfig: { toolResultBudget: budget, maxTokens: 50 },
		});

		const runtime = new AgentRuntime(config2);
		await runtime.run([
			{
				role: "tool",
				content: longToolContent,
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
			{
				role: "user",
				content: "short prompt",
				timestamp: Date.now(),
			},
		]);

		expect(compactFn).toHaveBeenCalled();
		expect(capturedResult).not.toBeNull();
		// Only L1 should have executed (early exit)
		expect(capturedResult!.results).toHaveLength(1);
		expect(capturedResult!.results[0].level).toBe(1);
		expect(capturedResult!.results[0].applied).toBe(true);
		// No L2+ results
		expect(capturedResult!.results.find((r) => r.level > 1)).toBeUndefined();
	});

	// I-RC-03: L6 async compaction works in loop, no hang
	it("I-RC-03: L6 async compaction with realistic delay completes without hanging", async () => {
		const pipelineDeps = makePipelineDeps();
		const delayMs = 50;

		// Make summarizeWithLLM return a short summary so L6 output is under budget,
		// but make the projectView very long so L5 output exceeds budget, pushing us to L6.
		const longProjectView = "P".repeat(600000); // makes L5 output huge
		pipelineDeps.contextCollapse.projectView = () => longProjectView;

		pipelineDeps.smCompact.summarizeWithLLM = vi.fn(async (msgs: AgentMessage[]) => {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			return `Async LLM summary of ${msgs.length} messages after ${delayMs}ms delay`;
		});

		const config: CompactionConfig = { ...DEFAULT_COMPACTION_CONFIG, maxTokens: 128000 };
		const pipeline = new CompactionPipeline(config, pipelineDeps);

		let capturedResult: {
			messages: AgentMessage[];
			results: CompactionLevelResult[];
			totalTokensFreed: number;
		} | null = null;
		const compactFn = vi.fn(async (msgs: AgentMessage[]) => {
			capturedResult = await pipeline.compact(msgs);
			const last = capturedResult.results[capturedResult.results.length - 1];
			return {
				level: last?.level ?? 0,
				applied: capturedResult.totalTokensFreed > 0,
				tokensFreed: capturedResult.totalTokensFreed,
				summary:
					capturedResult.messages.length > 0 && capturedResult.messages[0].role === "system"
						? capturedResult.messages[0].content
						: undefined,
			};
		});

		const config2 = makeRuntimeConfig({
			compactFn,
			compactionConfig: { maxTokens: 128000 },
		});

		const runtime = new AgentRuntime(config2);
		const now = Date.now();
		const longContent = "Y".repeat(600000); // 150k tokens, over budget
		const result = await runtime.run([
			{ role: "user", content: longContent, timestamp: now - 10000 },
			{ role: "assistant", content: "a detailed assistant reply with information", timestamp: now - 9000 },
		]);

		expect(compactFn).toHaveBeenCalled();
		expect(capturedResult).not.toBeNull();

		// L6 should have executed (async level with delay)
		const l6Result = capturedResult!.results.find((r) => r.level === 6);
		expect(l6Result).toBeDefined();
		expect(l6Result!.applied).toBe(true);

		// Verify the summarizeWithLLM mock was actually called
		expect(pipelineDeps.smCompact.summarizeWithLLM).toHaveBeenCalled();

		// Pipeline should have stopped at L6 (no L7)
		expect(capturedResult!.results.find((r) => r.level === 7)).toBeUndefined();

		// The final messages should contain the async summary
		const summaryMsg = capturedResult!.messages.find(
			(m) => m.role === "system" && m.content.includes("Async LLM summary"),
		);
		expect(summaryMsg).toBeDefined();
	});
});
