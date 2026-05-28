import { describe, expect, it, vi } from "bun:test";
import { CachedMicrocompact } from "../../src/compaction/cached-microcompact.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";
import type { AgentMessage } from "../../src/types.ts";

describe("L3: CachedMicrocompact", () => {
	it("deletes cached prefix tool results via API", () => {
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
