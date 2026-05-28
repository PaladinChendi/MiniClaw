import { describe, expect, it } from "bun:test";
import { TimeMicrocompact } from "../../src/compaction/time-microcompact.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";
import type { AgentMessage } from "../../src/types.ts";

describe("L2: TimeMicrocompact", () => {
	it("removes tool results older than threshold", () => {
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
