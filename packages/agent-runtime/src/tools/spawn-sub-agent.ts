import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

export class SpawnSubAgentTool {
	get definition(): ToolDefinition {
		return {
			name: "spawn_sub_agent",
			description: "Spawn a sub-agent to handle a sub-task. Returns the sub-agent's final response.",
			parameters: {
				type: "object",
				properties: {
					task: { type: "string", description: "The task description for the sub-agent" },
					context: { type: "string", description: "Additional context to pass" },
				},
				required: ["task"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const task = args.task as string;
		if (!task) throw new Error("task is required");

		// v1 stub: sub-agent is not yet wired to LLMRouter
		// Return a placeholder indicating the sub-agent framework is ready
		const context = args.context as string | undefined;
		return `[sub-agent] Task: ${task}${context ? `\nContext: ${context}` : ""}\nStatus: sub-agent framework ready — LLM loop not yet connected`;
	}
}
