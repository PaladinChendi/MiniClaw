import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult } from "./types.ts";

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
