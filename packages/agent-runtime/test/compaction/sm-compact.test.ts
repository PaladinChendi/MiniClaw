import { describe, it, expect, vi } from "bun:test";
import { SMCompact } from "../../src/compaction/sm-compact.ts";
import type { AgentMessage } from "../../src/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";

describe("L6: SMCompact", () => {
	it("summarizes conversation via LLM and returns compacted messages", async () => {
		const summarizeFn = vi.fn(async (_msgs: AgentMessage[]) => "Summary: user asked about auth, assistant fixed it.");
		const hookLog: any[] = [];

		const l6 = new SMCompact(DEFAULT_COMPACTION_CONFIG, {
			summarizeWithLLM: summarizeFn,
			onCompactionHook: (msg) => hookLog.push(msg),
			sessionId: "sess-1",
		});

		const messages: AgentMessage[] = [
			{ role: "user", content: "fix the auth bug", timestamp: Date.now() - 5000 },
			{ role: "assistant", content: "I fixed it by updating the middleware", timestamp: Date.now() - 4000 },
		];

		const result = await l6.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(6);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].content).toContain("Semantic Compact Summary");
		expect(summarizeFn).toHaveBeenCalledTimes(1);
		expect(hookLog).toHaveLength(2);
		expect(hookLog[0].phase).toBe("before");
		expect(hookLog[1].phase).toBe("after");
	});

	it("includes summary in result", async () => {
		const l6 = new SMCompact(DEFAULT_COMPACTION_CONFIG, {
			summarizeWithLLM: async () => "brief summary",
			sessionId: "s2",
		});

		const result = await l6.compact([
			{ role: "user", content: "hi", timestamp: Date.now() },
		]);

		expect(result.summary).toBe("brief summary");
	});
});
