import type { AgentMessage } from "../types.ts";
import type { CompactionConfig, CompactionLevelResult } from "./types.ts";

export interface ContextCollapseDeps {
	projectView: () => string;
}

export class ContextCollapse {
	constructor(
		private config: CompactionConfig,
		private deps: ContextCollapseDeps,
	) {}

	compact(messages: AgentMessage[]): CompactionLevelResult & { messages: AgentMessage[] } {
		const projectView = this.deps.projectView();
		const now = new Date().toISOString();

		const stages = this.extractStages(messages);
		const collapsedContent = this.buildCollapsedContent(stages, projectView, now);

		const collapsedMessage: AgentMessage = {
			role: "system",
			content: collapsedContent,
			timestamp: Date.now(),
		};

		const tokensBefore = this.estimateTokens(messages);
		const tokensAfter = this.estimateTokens([collapsedMessage]);

		return {
			level: 5,
			name: "context-collapse",
			applied: true,
			tokensBefore,
			tokensAfter,
			tokensFreed: tokensBefore - tokensAfter,
			summary: collapsedContent.slice(0, 200),
			messages: [collapsedMessage],
		};
	}

	private extractStages(messages: AgentMessage[]): Array<{ stage: string; summary: string }> {
		const stages: Array<{ stage: string; summary: string }> = [];
		let currentStage = "init";
		let stageMessages: string[] = [];

		for (const msg of messages) {
			if (msg.role === "assistant" && msg.content.length > 0) {
				if (stageMessages.length > 0) {
					stages.push({
						stage: currentStage,
						summary: stageMessages.join(" ").slice(0, 500),
					});
				}
				currentStage = `step-${stages.length + 1}`;
				stageMessages = [msg.content.slice(0, 500)];
			} else if (msg.role === "tool") {
				stageMessages.push(msg.content.slice(0, 200));
			} else if (msg.role === "user") {
				stageMessages.push(msg.content.slice(0, 300));
			}
		}

		if (stageMessages.length > 0) {
			stages.push({ stage: currentStage, summary: stageMessages.join(" ").slice(0, 500) });
		}

		return stages;
	}

	private buildCollapsedContent(
		stages: Array<{ stage: string; summary: string }>,
		projectView: string,
		timestamp: string,
	): string {
		const parts: string[] = [`## Context Collapse — ${timestamp}`, "", "### Stages"];

		for (const s of stages) {
			parts.push(`- **${s.stage}**: ${s.summary}`);
		}

		parts.push("", "### Project View");
		parts.push(projectView);

		return parts.join("\n");
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
