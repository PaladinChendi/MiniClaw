import type { ToolDefinition, ToolExecutionContext } from "./types.ts";

export class ToolRegistry {
	private tools = new Map<string, ToolDefinition>();

	register(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}

	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name);
	}

	getDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		}));
	}

	async execute(name: string, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const tool = this.tools.get(name);
		if (!tool) throw new Error(`Tool not found: ${name}`);
		return tool.execute(args, ctx);
	}
}
