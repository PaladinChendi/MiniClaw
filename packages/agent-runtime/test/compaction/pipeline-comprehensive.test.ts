import { describe, expect, it, vi } from "bun:test";
import { CompactionPipeline } from "../../src/compaction/pipeline.ts";
import type { CompactionPipelineDeps } from "../../src/compaction/pipeline.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";
import type { CompactionConfig, CompactionHookMessage } from "../../src/compaction/types.ts";
import type { AgentMessage } from "../../src/types.ts";

function makeDeps(overrides?: Partial<CompactionPipelineDeps>): CompactionPipelineDeps {
	return {
		cachedMicrocompact: {
			deleteCachedPrefix: vi.fn(async () => true),
			isCachedPrefix: () => false,
		},
		contextCollapse: {
			projectView: () => "Project: test",
		},
		smCompact: {
			summarizeWithLLM: vi.fn(async (msgs: AgentMessage[]) => `Summary of ${msgs.length} messages`),
			sessionId: "test-session",
		},
		legacyCompact: {
			forkAndSummarize: vi.fn(async (msgs: AgentMessage[]) => `Full summary of ${msgs.length} messages`),
			sessionId: "test-session",
		},
		...overrides,
	};
}

function makeConfig(overrides?: Partial<CompactionConfig>): CompactionConfig {
	return { ...DEFAULT_COMPACTION_CONFIG, ...overrides };
}

describe("CompactionPipeline comprehensive", () => {
	// U-CP-01: L1 truncates long tool results
	it("U-CP-01: L1 truncates long tool results with [TRUNCATED] suffix", async () => {
		const budget = 100;
		const config = makeConfig({ toolResultBudget: budget, maxTokens: 128000 });
		const pipeline = new CompactionPipeline(config, makeDeps());

		const longContent = "A".repeat(budget + 500);
		const messages: AgentMessage[] = [{ role: "tool", content: longContent, toolCallId: "tc1", timestamp: Date.now() }];

		const result = await pipeline.compact(messages);

		expect(result.results.length).toBeGreaterThanOrEqual(1);
		expect(result.results[0].level).toBe(1);
		expect(result.results[0].applied).toBe(true);
		expect(result.results[0].tokensFreed).toBeGreaterThan(0);

		const toolMsg = result.messages.find((m) => m.role === "tool");
		expect(toolMsg).toBeDefined();
		expect(toolMsg!.content).toContain("[TRUNCATED");
		expect(toolMsg!.content.length).toBeLessThan(longContent.length);
	});

	// U-CP-02: L2 removes old tool messages by age
	it("U-CP-02: L2 removes old tool messages by age", async () => {
		const now = Date.now();
		const ageMs = 3600000; // 1 hour

		// Old tool message is large; recent messages are small.
		// After L2 removes old tool, total tokens fall below maxTokens.
		const oldToolContent = "Z".repeat(5000); // 1250 tokens
		const recentUserContent = "hi"; // ~1 token
		const recentToolContent = "ok"; // ~1 token

		// Set maxTokens so that removing old tool brings us under budget,
		// but with the old tool present we are over budget.
		const config = makeConfig({ timeMicrocompactAgeMs: ageMs, maxTokens: 50 });
		const pipeline = new CompactionPipeline(config, makeDeps());

		const messages: AgentMessage[] = [
			// Old tool message (> 1h ago)
			{ role: "tool", content: oldToolContent, toolCallId: "tc1", timestamp: now - 7200000 },
			// Recent user message
			{ role: "user", content: recentUserContent, timestamp: now - 1000 },
			// Recent tool message (< 1h ago)
			{ role: "tool", content: recentToolContent, toolCallId: "tc2", timestamp: now - 1000 },
		];

		const result = await pipeline.compact(messages);

		// Find L2 result
		const l2Result = result.results.find((r) => r.level === 2);
		expect(l2Result).toBeDefined();
		expect(l2Result!.applied).toBe(true);

		// Recent tool message should survive in final output
		const recentToolMsg = result.messages.find((m) => m.role === "tool" && m.toolCallId === "tc2");
		expect(recentToolMsg).toBeDefined();
	});

	// U-CP-03: L3 removes cached prefix tool messages
	it("U-CP-03: L3 removes cached prefix tool messages and calls deleteCachedPrefix", async () => {
		// Make the cached content very long so it pushes total tokens over budget.
		// Use a recent timestamp so L2 (time-based) does not remove it first.
		const cachedContent = `cached_prefix_${"D".repeat(500)}`; // ~130 tokens
		const deleteFn = vi.fn(async () => true);
		const deps = makeDeps({
			cachedMicrocompact: {
				deleteCachedPrefix: deleteFn,
				isCachedPrefix: (content: string) => content.startsWith("cached_prefix_"),
			},
		});

		// maxTokens low enough that after L3 removes the cached message, we are under budget.
		const config = makeConfig({ maxTokens: 20 });
		const pipeline = new CompactionPipeline(config, deps);

		const now = Date.now();
		const messages: AgentMessage[] = [
			// Cached tool message — recent so L2 won't touch it
			{ role: "tool", content: cachedContent, toolCallId: "tc1", timestamp: now - 1000 },
			// Normal (uncached) tool message
			{ role: "tool", content: "normal_tool_result", toolCallId: "tc2", timestamp: now - 1000 },
			{ role: "user", content: "short question", timestamp: now - 500 },
		];

		const result = await pipeline.compact(messages);

		const l3Result = result.results.find((r) => r.level === 3);
		expect(l3Result).toBeDefined();
		expect(l3Result!.applied).toBe(true);

		// deleteCachedPrefix should have been called with the cached content
		expect(deleteFn).toHaveBeenCalledWith(cachedContent);

		// The cached prefix tool message should be removed from the final messages
		const cachedMsg = result.messages.find((m) => m.content === cachedContent);
		expect(cachedMsg).toBeUndefined();
	});

	// U-CP-04: L4 keeps only last N rounds
	it("U-CP-04: L4 keeps only last N rounds when historySnipGroups=1", async () => {
		// Build 5 rounds, with the last round being short.
		// Set maxTokens so that after snipping to 1 round, we are under budget.
		const now = Date.now();
		const messages: AgentMessage[] = [];
		for (let i = 0; i < 5; i++) {
			messages.push({
				role: "user",
				content: i < 4 ? `round ${i} user question with substantial padding text to push token count up` : "last round",
				timestamp: now - (5 - i) * 60000,
			});
			messages.push({
				role: "assistant",
				content: i < 4 ? `round ${i} assistant answer with lots of details and context` : "last answer",
				timestamp: now - (5 - i) * 60000 + 1000,
			});
		}

		const config = makeConfig({ historySnipGroups: 1, maxTokens: 50 });
		const pipeline = new CompactionPipeline(config, makeDeps());

		const result = await pipeline.compact(messages);

		const l4Result = result.results.find((r) => r.level === 4);
		expect(l4Result).toBeDefined();
		expect(l4Result!.applied).toBe(true);
		expect(l4Result!.tokensFreed).toBeGreaterThan(0);
	});

	// U-CP-05: L5 produces structured summary
	it("U-CP-05: L5 produces structured summary with project view", async () => {
		// L5 is context-collapse. We need L5 to be the level that brings us under budget,
		// so L5's collapsed output must be under maxTokens, but prior levels must still
		// leave us over budget.
		// Strategy: make projectView very short, make input very large.
		const projectViewText = "Project: miniclaw — multi-channel AI agent";
		const deps = makeDeps({
			contextCollapse: {
				projectView: () => projectViewText,
			},
		});
		// maxTokens high enough that L5 output is under budget.
		const config = makeConfig({ maxTokens: 128000 });
		const pipeline = new CompactionPipeline(config, deps);

		// Create messages that are over budget so compaction triggers,
		// but after L5 collapse, under budget.
		const longContent = "X".repeat(600000); // 150k tokens — over 128k budget
		const now = Date.now();
		const messages: AgentMessage[] = [
			{ role: "user", content: longContent, timestamp: now - 10000 },
			{ role: "assistant", content: "a response", timestamp: now - 9000 },
		];

		const result = await pipeline.compact(messages);

		const l5Result = result.results.find((r) => r.level === 5);
		expect(l5Result).toBeDefined();
		expect(l5Result!.applied).toBe(true);

		// After L5, messages should be a single system message containing project view
		const systemMsg = result.messages.find((m) => m.role === "system");
		expect(systemMsg).toBeDefined();
		expect(systemMsg!.content).toContain("Context Collapse");
		expect(systemMsg!.content).toContain(projectViewText);

		// Pipeline should have stopped at L5 (no L6 or L7)
		expect(result.results.find((r) => r.level === 6)).toBeUndefined();
		expect(result.results.find((r) => r.level === 7)).toBeUndefined();
	});

	// U-CP-06: L6 async LLM summary
	it("U-CP-06: L6 calls summarizeWithLLM, fires before/after hooks, replaces messages", async () => {
		const hookCalls: CompactionHookMessage[] = [];
		const summarizeFn = vi.fn(async (msgs: AgentMessage[]) => `LLM summary of ${msgs.length} messages`);

		// Make L6 the final level: L5 output still over budget, L6 output under budget.
		// Strategy: make projectView very long so L5 output exceeds maxTokens,
		// pushing to L6. L6 returns a short summary.
		const longProjectView = "P".repeat(600000); // will make L5 output huge
		const deps = makeDeps({
			contextCollapse: {
				projectView: () => longProjectView,
			},
			smCompact: {
				summarizeWithLLM: summarizeFn,
				sessionId: "hook-test-session",
				onCompactionHook: (msg: CompactionHookMessage) => hookCalls.push(msg),
			},
			onCompactionHook: (msg: CompactionHookMessage) => hookCalls.push(msg),
		});
		const config = makeConfig({ maxTokens: 128000 });
		const pipeline = new CompactionPipeline(config, deps);

		const now = Date.now();
		const longContent = "Y".repeat(600000); // 150k tokens, over budget
		const messages: AgentMessage[] = [
			{ role: "user", content: longContent, timestamp: now - 10000 },
			{ role: "assistant", content: "an assistant response", timestamp: now - 9000 },
			{ role: "tool", content: "tool output from first round", toolCallId: "tc1", timestamp: now - 8000 },
		];

		const result = await pipeline.compact(messages);

		const l6Result = result.results.find((r) => r.level === 6);
		expect(l6Result).toBeDefined();
		expect(l6Result!.applied).toBe(true);

		// summarizeWithLLM should have been called
		expect(summarizeFn).toHaveBeenCalled();

		// Before/after hooks should have fired for L6
		const beforeHooks = hookCalls.filter((h) => h.phase === "before" && h.level === 6);
		const afterHooks = hookCalls.filter((h) => h.phase === "after" && h.level === 6);
		expect(beforeHooks.length).toBeGreaterThanOrEqual(1);
		expect(afterHooks.length).toBeGreaterThanOrEqual(1);

		// Messages should be replaced with L6 summary system message
		const summaryMsg = result.messages.find(
			(m) => m.role === "system" && m.content.includes("Semantic Compact Summary"),
		);
		expect(summaryMsg).toBeDefined();
		expect(summaryMsg!.content).toContain("LLM summary of");

		// Pipeline should have stopped at L6 (no L7)
		expect(result.results.find((r) => r.level === 7)).toBeUndefined();
	});

	// U-CP-07: L7 async fork+summarize
	it("U-CP-07: L7 calls forkAndSummarize and fires hooks", async () => {
		const hookCalls: CompactionHookMessage[] = [];
		const forkFn = vi.fn(async (msgs: AgentMessage[]) => `Forked summary of ${msgs.length} messages`);

		// Strategy: L5 output exceeds budget (huge projectView), L6 output exceeds budget (huge LLM summary).
		// L7 returns a short summary that is under budget.
		const hugeProjectView = "P".repeat(600000);
		const hugeSummary = "S".repeat(600000);
		const deps = makeDeps({
			contextCollapse: {
				projectView: () => hugeProjectView,
			},
			smCompact: {
				summarizeWithLLM: vi.fn(async () => hugeSummary),
				sessionId: "legacy-test-session",
				onCompactionHook: (msg: CompactionHookMessage) => hookCalls.push(msg),
			},
			legacyCompact: {
				forkAndSummarize: forkFn,
				sessionId: "legacy-test-session",
				onCompactionHook: (msg: CompactionHookMessage) => hookCalls.push(msg),
			},
			onCompactionHook: (msg: CompactionHookMessage) => hookCalls.push(msg),
		});
		const config = makeConfig({ maxTokens: 128000 });
		const pipeline = new CompactionPipeline(config, deps);

		const now = Date.now();
		const longContent = "W".repeat(600000);
		const messages: AgentMessage[] = [
			{ role: "user", content: longContent, timestamp: now - 10000 },
			{ role: "assistant", content: "a response", timestamp: now - 9000 },
		];

		const result = await pipeline.compact(messages);

		const l7Result = result.results.find((r) => r.level === 7);
		expect(l7Result).toBeDefined();
		expect(l7Result!.applied).toBe(true);

		// forkAndSummarize should have been called
		expect(forkFn).toHaveBeenCalled();

		// Before/after hooks for L7
		const beforeHooks = hookCalls.filter((h) => h.phase === "before" && h.level === 7);
		const afterHooks = hookCalls.filter((h) => h.phase === "after" && h.level === 7);
		expect(beforeHooks.length).toBeGreaterThanOrEqual(1);
		expect(afterHooks.length).toBeGreaterThanOrEqual(1);

		// Result should contain a Full Conversation Summary message
		const summaryMsg = result.messages.find(
			(m) => m.role === "system" && m.content.includes("Full Conversation Summary"),
		);
		expect(summaryMsg).toBeDefined();
	});

	// U-CP-08: Early exit when L1 resolves overflow
	it("U-CP-08: Early exit when L1 alone resolves overflow", async () => {
		const budget = 100;
		const config = makeConfig({
			toolResultBudget: budget,
			maxTokens: 128000,
		});
		const pipeline = new CompactionPipeline(config, makeDeps());

		const messages: AgentMessage[] = [
			{ role: "tool", content: "B".repeat(budget + 200), toolCallId: "tc1", timestamp: Date.now() },
			{ role: "user", content: "short question", timestamp: Date.now() },
		];

		const result = await pipeline.compact(messages);

		// Only L1 should have executed (early exit)
		expect(result.results).toHaveLength(1);
		expect(result.results[0].level).toBe(1);
		expect(result.results[0].applied).toBe(true);

		// Verify no L2-L7 results exist
		expect(result.results.find((r) => r.level > 1)).toBeUndefined();
	});

	// U-CP-09: All 7 levels execute when very over budget
	it("U-CP-09: All 7 levels execute when very over budget", async () => {
		const config = makeConfig({ maxTokens: 5 });
		const pipeline = new CompactionPipeline(config, makeDeps());

		const now = Date.now();
		const messages: AgentMessage[] = [
			{
				role: "user",
				content: "a very long user message that pushes us well over the tiny token budget",
				timestamp: now - 100000,
			},
			{
				role: "assistant",
				content: "a detailed assistant response with substantial content inside",
				timestamp: now - 90000,
			},
			{
				role: "tool",
				content: "tool output that is also quite long and adds to the token budget problem",
				toolCallId: "tc1",
				timestamp: now - 80000,
			},
			{
				role: "user",
				content: "another user message continuing the conversation with extra text padding",
				timestamp: now - 5000,
			},
			{
				role: "assistant",
				content: "another assistant response with lots of details and information",
				timestamp: now - 4000,
			},
		];

		const result = await pipeline.compact(messages);

		// All 7 levels should have executed
		expect(result.results).toHaveLength(7);
		for (let level = 1; level <= 7; level++) {
			expect(result.results.find((r) => r.level === level)).toBeDefined();
		}
	});

	// U-CP-10: Empty message list input
	it("U-CP-10: Empty message list returns minimal result with zero freed tokens", async () => {
		const config = makeConfig();
		const pipeline = new CompactionPipeline(config, makeDeps());

		const result = await pipeline.compact([]);

		// Pipeline always runs L1 first, which produces a result even for empty input
		expect(result.messages).toEqual([]);
		expect(result.results.length).toBeGreaterThanOrEqual(1);
		expect(result.totalTokensFreed).toBe(0);
		// The L1 result for empty input should show nothing was applied
		expect(result.results[0].applied).toBe(false);
	});
});
