import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult } from "./types.ts";

export class HistorySnip {
	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		let applied = false;
		const groups = this.groupByRound(messages);

		if (groups.length <= this.config.historySnipGroups) {
			return {
				level: 4,
				name: "history-snip",
				applied: false,
				tokensBefore: this.estimateTokens(messages),
				tokensAfter: this.estimateTokens(messages),
				tokensFreed: 0,
				messages,
			};
		}

		applied = true;
		const snipped = groups.slice(this.config.historySnipGroups).flat();

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(snipped);

		return {
			level: 4,
			name: "history-snip",
			applied,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			messages: snipped,
		};
	}

	private groupByRound(messages: AgentMessage[]): AgentMessage[][] {
		const groups: AgentMessage[][] = [];
		let current: AgentMessage[] = [];

		for (const msg of messages) {
			if (msg.role === "user" && current.length > 0) {
				groups.push(current);
				current = [];
			}
			current.push(msg);
		}
		if (current.length > 0) groups.push(current);
		return groups;
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
