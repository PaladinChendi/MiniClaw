import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult, CompactionHookMessage } from "./types.ts";

export interface SMCompactDeps {
	summarizeWithLLM: (messages: AgentMessage[]) => Promise<string>;
	onCompactionHook?: (msg: CompactionHookMessage) => void;
	sessionId: string;
}

export class SMCompact {
	constructor(
		private config: CompactionConfig,
		private deps: SMCompactDeps,
	) {}

	async compact(messages: AgentMessage[]): Promise<CompactionLevelResult & { messages: AgentMessage[] }> {
		const tokensBefore = this.estimateTokens(messages);
		const targetTokens = Math.floor(this.config.maxTokens * this.config.smCompactTargetRatio);

		this.deps.onCompactionHook?.({
			type: "onCompactionHookMessages",
			phase: "before",
			level: 6,
			sessionId: this.deps.sessionId,
			deletedMessageCount: messages.length,
		});

		const summary = await this.deps.summarizeWithLLM(messages);

		const summaryMessage: AgentMessage = {
			role: "system",
			content: `## Semantic Compact Summary\n\n${summary}`,
			timestamp: Date.now(),
		};

		this.deps.onCompactionHook?.({
			type: "onCompactionHookMessages",
			phase: "after",
			level: 6,
			sessionId: this.deps.sessionId,
			deletedMessageCount: messages.length,
			summary,
		});

		const tokensAfter = this.estimateTokens([summaryMessage]);

		return {
			level: 6,
			name: "sm-compact",
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
