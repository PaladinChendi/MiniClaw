import { describe, it, expect } from "bun:test";
import { ToolResultBudget } from "../../src/compaction/tool-result-budget.ts";
import type { AgentMessage } from "../../src/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";

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

		expect(result.messages[0].content).toContain("[TRUNCATED: tool result exceeded budget]");
	});
});
