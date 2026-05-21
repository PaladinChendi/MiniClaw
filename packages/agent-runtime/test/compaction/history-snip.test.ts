import { describe, it, expect } from "bun:test";
import { HistorySnip } from "../../src/compaction/history-snip.ts";
import type { AgentMessage } from "../../src/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";

describe("L4: HistorySnip", () => {
	it("removes oldest round-group when enough rounds exist", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{ role: "user", content: "first question", timestamp: now - 3000 },
			{ role: "assistant", content: "first answer", timestamp: now - 2500 },
			{ role: "user", content: "second question", timestamp: now - 2000 },
			{ role: "assistant", content: "second answer", timestamp: now - 1500 },
			{ role: "user", content: "third question", timestamp: now - 1000 },
			{ role: "assistant", content: "third answer", timestamp: now - 500 },
		];

		const l4 = new HistorySnip(DEFAULT_COMPACTION_CONFIG);
		const result = l4.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(4);
		expect(result.messages.length).toBeLessThan(messages.length);
		expect(result.messages[0].content).toBe("second question");
	});

	it("no-ops when not enough round-groups", () => {
		const now = Date.now();
		const messages: AgentMessage[] = [
			{ role: "user", content: "only question", timestamp: now },
			{ role: "assistant", content: "only answer", timestamp: now },
		];

		const l4 = new HistorySnip(DEFAULT_COMPACTION_CONFIG);
		const result = l4.compact(messages);

		expect(result.applied).toBe(false);
		expect(result.messages.length).toBe(2);
	});
});
