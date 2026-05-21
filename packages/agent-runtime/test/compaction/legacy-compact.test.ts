import { describe, it, expect, vi } from "bun:test";
import { LegacyCompact } from "../../src/compaction/legacy-compact.ts";
import type { AgentMessage } from "../../src/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";

describe("L7: LegacyCompact", () => {
	it("forks agent to produce full conversation summary", async () => {
		const forkFn = vi.fn(async (_msgs: AgentMessage[]) => "Full summary: the user asked about X, we did Y, result Z.");
		const hookLog: any[] = [];

		const l7 = new LegacyCompact(DEFAULT_COMPACTION_CONFIG, {
			forkAndSummarize: forkFn,
			onCompactionHook: (msg) => hookLog.push(msg),
			sessionId: "sess-1",
		});

		const messages: AgentMessage[] = [
			{ role: "user", content: "long conversation start", timestamp: Date.now() - 100000 },
			{ role: "assistant", content: "response 1", timestamp: Date.now() - 90000 },
			{ role: "user", content: "follow up", timestamp: Date.now() - 80000 },
			{ role: "assistant", content: "response 2", timestamp: Date.now() - 70000 },
		];

		const result = await l7.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(7);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].content).toContain("Full Conversation Summary");
		expect(forkFn).toHaveBeenCalledTimes(1);
		expect(hookLog).toHaveLength(2);
		expect(hookLog[0].level).toBe(7);
		expect(hookLog[1].phase).toBe("after");
	});

	it("includes summary in result", async () => {
		const l7 = new LegacyCompact(DEFAULT_COMPACTION_CONFIG, {
			forkAndSummarize: async () => "legacy summary text",
			sessionId: "s2",
		});

		const result = await l7.compact([
			{ role: "user", content: "hi", timestamp: Date.now() },
		]);

		expect(result.summary).toBe("legacy summary text");
	});
});
