import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult, CompactionHookMessage } from "./types.ts";

export interface LegacyCompactDeps {
	forkAndSummarize: (messages: AgentMessage[]) => Promise<string>;
	onCompactionHook?: (msg: CompactionHookMessage) => void;
	sessionId: string;
}

export class LegacyCompact {
	constructor(
		private config: CompactionConfig,
		private deps: LegacyCompactDeps,
	) {}

	async compact(messages: AgentMessage[]): Promise<CompactionLevelResult & { messages: AgentMessage[] }> {
		const tokensBefore = this.estimateTokens(messages);

		this.deps.onCompactionHook?.({
			type: "onCompactionHookMessages",
			phase: "before",
			level: 7,
			sessionId: this.deps.sessionId,
			deletedMessageCount: messages.length,
		});

		const summary = await this.deps.forkAndSummarize(messages);

		const summaryMessage: AgentMessage = {
			role: "system",
			content: `## Full Conversation Summary\n\n${summary}`,
			timestamp: Date.now(),
		};

		this.deps.onCompactionHook?.({
			type: "onCompactionHookMessages",
			phase: "after",
			level: 7,
			sessionId: this.deps.sessionId,
			deletedMessageCount: messages.length,
			summary,
		});

		const tokensAfter = this.estimateTokens([summaryMessage]);

		return {
			level: 7,
			name: "legacy-compact",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			summary,
			messages: [summaryMessage],
		};
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
