import type { AgentMessage } from "../types.ts";
import { CachedMicrocompact, type CachedMicrocompactDeps } from "./cached-microcompact.ts";
import { ContextCollapse, type ContextCollapseDeps } from "./context-collapse.ts";
import { HistorySnip } from "./history-snip.ts";
import { LegacyCompact, type LegacyCompactDeps } from "./legacy-compact.ts";
import { SMCompact, type SMCompactDeps } from "./sm-compact.ts";
import { TimeMicrocompact } from "./time-microcompact.ts";
import { ToolResultBudget } from "./tool-result-budget.ts";
import type { CompactionConfig, CompactionHookMessage, CompactionLevelResult } from "./types.ts";

export interface CompactionPipelineDeps {
	cachedMicrocompact: CachedMicrocompactDeps;
	contextCollapse: ContextCollapseDeps;
	smCompact: SMCompactDeps;
	legacyCompact: LegacyCompactDeps;
	onCompactionHook?: (msg: CompactionHookMessage) => void;
}

export class CompactionPipeline {
	private l1: ToolResultBudget;
	private l2: TimeMicrocompact;
	private l3: CachedMicrocompact;
	private l4: HistorySnip;
	private l5: ContextCollapse;
	private l6: SMCompact;
	private l7: LegacyCompact;
	private config: CompactionConfig;

	constructor(config: CompactionConfig, deps: CompactionPipelineDeps) {
		this.config = config;
		this.l1 = new ToolResultBudget(config);
		this.l2 = new TimeMicrocompact(config);
		this.l3 = new CachedMicrocompact(config, deps.cachedMicrocompact);
		this.l4 = new HistorySnip(config);
		this.l5 = new ContextCollapse(config, deps.contextCollapse);
		this.l6 = new SMCompact(config, deps.smCompact);
		this.l7 = new LegacyCompact(config, deps.legacyCompact);
	}

	async compact(messages: AgentMessage[]): Promise<{
		messages: AgentMessage[];
		results: CompactionLevelResult[];
		totalTokensFreed: number;
	}> {
		const results: CompactionLevelResult[] = [];
		let currentMessages = messages;
		let totalTokensFreed = 0;

		// L1: Tool Result Budget (synchronous)
		const r1 = this.l1.compact(currentMessages);
		results.push(r1);
		currentMessages = r1.messages;
		totalTokensFreed += r1.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L2: Time Microcompact (synchronous)
		const r2 = this.l2.compact(currentMessages);
		results.push(r2);
		currentMessages = r2.messages;
		totalTokensFreed += r2.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L3: Cached Microcompact (synchronous)
		const r3 = this.l3.compact(currentMessages);
		results.push(r3);
		currentMessages = r3.messages;
		totalTokensFreed += r3.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L4: History Snip (synchronous)
		const r4 = this.l4.compact(currentMessages);
		results.push(r4);
		currentMessages = r4.messages;
		totalTokensFreed += r4.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L5: Context Collapse (synchronous)
		const r5 = this.l5.compact(currentMessages);
		results.push(r5);
		currentMessages = r5.messages;
		totalTokensFreed += r5.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L6: SM-compact (async — LLM summary)
		const r6 = await this.l6.compact(currentMessages);
		results.push(r6);
		currentMessages = r6.messages;
		totalTokensFreed += r6.tokensFreed;
		if (this.underBudget(currentMessages)) return { messages: currentMessages, results, totalTokensFreed };

		// L7: Legacy compact (async — forked agent)
		const r7 = await this.l7.compact(currentMessages);
		results.push(r7);
		currentMessages = r7.messages;
		totalTokensFreed += r7.tokensFreed;

		return { messages: currentMessages, results, totalTokensFreed };
	}

	private underBudget(messages: AgentMessage[]): boolean {
		const tokens = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
		return tokens <= this.config.maxTokens;
	}
}
