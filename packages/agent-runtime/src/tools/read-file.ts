import { resolve } from "path";
import { readFile } from "fs/promises";
import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

export class ReadFileTool {
	get definition(): ToolDefinition {
		return {
			name: "read_file",
			description: "Read the contents of a file at the given path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative or absolute file path" },
				},
				required: ["path"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const filePath = args.path as string;
		if (!filePath) throw new Error("path is required");

		const absolutePath = resolve(ctx.workingDir, filePath);
		const content = await readFile(absolutePath, "utf-8");
		return content;
	}
}
