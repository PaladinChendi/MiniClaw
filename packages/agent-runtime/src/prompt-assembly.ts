import type { AgentMessage } from "./types.ts";

export interface MemoryEntry {
	content: string;
	type: string;
	relevanceScore?: number;
}

export interface ToolDef {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface PromptAssemblerConfig {
	baseSystemPrompt: string;
	maxTokens?: number;
}

export interface AssembledPrompt {
	systemPrompt: string;
	messages: AgentMessage[];
	estimatedTokens: number;
}

const CHARS_PER_TOKEN = 4;

export class PromptAssembler {
	private baseSystemPrompt: string;
	private maxTokens: number;

	constructor(config: PromptAssemblerConfig) {
		this.baseSystemPrompt = config.baseSystemPrompt;
		this.maxTokens = config.maxTokens ?? 128000;
	}

	assemble(messages: AgentMessage[], toolDefs: ToolDef[] = [], memories: MemoryEntry[] = []): AssembledPrompt {
		const parts: string[] = [this.baseSystemPrompt];

		if (memories.length > 0) {
			parts.push("\n## Relevant Memories");
			for (const m of memories) {
				parts.push(`- [${m.type}] ${m.content}`);
			}
		}

		if (toolDefs.length > 0) {
			parts.push("\n## Available Tools");
			for (const t of toolDefs) {
				parts.push(`- ${t.name}: ${t.description}`);
			}
		}

		const systemPrompt = parts.join("\n");
		const systemTokens = Math.ceil(systemPrompt.length / CHARS_PER_TOKEN);

		let remainingBudget = this.maxTokens - systemTokens;
		if (remainingBudget < 0) remainingBudget = 0;

		const filteredMessages: AgentMessage[] = [];
		let usedTokens = 0;

		for (const msg of messages) {
			const msgTokens = Math.ceil(msg.content.length / CHARS_PER_TOKEN);
			if (usedTokens + msgTokens <= remainingBudget) {
				filteredMessages.push(msg);
				usedTokens += msgTokens;
			} else {
				break;
			}
		}

		return {
			systemPrompt,
			messages: filteredMessages,
			estimatedTokens: systemTokens + usedTokens,
		};
	}
}
