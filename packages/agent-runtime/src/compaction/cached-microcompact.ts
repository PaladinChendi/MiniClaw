import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult } from "./types.ts";

export interface CachedMicrocompactDeps {
	deleteCachedPrefix: (prefix: string) => Promise<boolean>;
	isCachedPrefix: (content: string) => boolean;
}

export class CachedMicrocompact {
	constructor(
		private config: CompactionConfig,
		private deps: CachedMicrocompactDeps,
	) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		let applied = false;
		const compacted: AgentMessage[] = [];

		for (const msg of messages) {
			if (msg.role === "tool" && this.deps.isCachedPrefix(msg.content)) {
				applied = true;
				this.deps.deleteCachedPrefix(msg.content);
				continue;
			}
			compacted.push(msg);
		}

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens(compacted);

		return {
			level: 3,
			name: "cached-microcompact",
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
