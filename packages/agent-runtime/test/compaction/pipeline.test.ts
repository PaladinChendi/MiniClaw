import { describe, expect, it, vi } from "bun:test";
import { CompactionPipeline } from "../../src/compaction/pipeline.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";
import type { AgentMessage } from "../../src/types.ts";

function makeDeps() {
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
	};
}

describe("CompactionPipeline", () => {
	it("runs L1 only when budget resolves overflow", async () => {
		const pipeline = new CompactionPipeline({ ...DEFAULT_COMPACTION_CONFIG, maxTokens: 128000 }, makeDeps());
		const messages: AgentMessage[] = [
			{
				role: "tool",
				content: "x".repeat(20000),
				toolCallId: "tc1",
				timestamp: Date.now(),
			},
		];
		const result = await pipeline.compact(messages);
		expect(result.results.length).toBeGreaterThanOrEqual(1);
		expect(result.results[0].level).toBe(1);
		expect(result.totalTokensFreed).toBeGreaterThan(0);
	});

	it("progresses through levels until under budget", async () => {
		const pipeline = new CompactionPipeline({ ...DEFAULT_COMPACTION_CONFIG, maxTokens: 5 }, makeDeps());
		const messages: AgentMessage[] = [
			{ role: "user", content: "hello world this is a test", timestamp: Date.now() - 100000 },
			{ role: "assistant", content: "response text here with some content", timestamp: Date.now() - 90000 },
			{
				role: "tool",
				content: `tool output is long ${"z".repeat(100)}`,
				toolCallId: "tc1",
				timestamp: Date.now() - 80000,
			},
			{ role: "user", content: "another message with lots of text content", timestamp: Date.now() - 1000 },
		];
		const result = await pipeline.compact(messages);
		expect(result.results.length).toBeGreaterThanOrEqual(2);
		expect(result.messages.length).toBeLessThanOrEqual(messages.length);
	});

	it("returns totalTokensFreed from all applied levels", async () => {
		const pipeline = new CompactionPipeline({ ...DEFAULT_COMPACTION_CONFIG, maxTokens: 128000 }, makeDeps());
		const result = await pipeline.compact([{ role: "user", content: "short", timestamp: Date.now() }]);
		expect(typeof result.totalTokensFreed).toBe("number");
	});
});
