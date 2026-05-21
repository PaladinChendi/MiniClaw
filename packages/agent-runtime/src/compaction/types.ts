import type { AgentMessage } from "../types.ts";

export interface CompactionConfig {
	maxTokens: number;
	toolResultBudget: number;
	timeMicrocompactAgeMs: number;
	historySnipGroups: number;
	smCompactTargetRatio: number;
}

export interface CompactionLevelResult {
	level: number;
	name: string;
	applied: boolean;
	tokensBefore: number;
	tokensAfter: number;
	tokensFreed: number;
	summary?: string;
}

export interface CompactionHookMessage {
	type: "onCompactionHookMessages";
	phase: "before" | "after";
	level: number;
	sessionId: string;
	deletedMessageCount: number;
	summary?: string;
}

export interface CompactionProvider {
	name: string;
	compact(messages: AgentMessage[], config: CompactionConfig): Promise<AgentMessage[]>;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
	maxTokens: 128000,
	toolResultBudget: 10000,
	timeMicrocompactAgeMs: 3600000,
	historySnipGroups: 1,
	smCompactTargetRatio: 0.5,
};
