import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult } from "./types.ts";

export class TimeMicrocompact {
	constructor(private config: CompactionConfig) {}

	compact(messages: AgentMessage[], now = Date.now()): CompactionLevelResult & { messages: AgentMessage[] } {
		const ageMs = this.config.timeMicrocompactAgeMs;
		let applied = false;

		const compacted = messages.filter((msg) => {
			if (msg.role !== "tool") return true;
			const age = now - msg.timestamp;
			if (age > ageMs) {
				applied = true;
				return false;
			}
			return true;
		});

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 2,
			name: "time-microcompact",
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
