import { readdir, stat } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

export class ListFilesTool {
	get definition(): ToolDefinition {
		return {
			name: "list_files",
			description: "List files and directories at the given path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory path to list. Defaults to working directory." },
				},
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const dirPath = (args.path as string) || ".";
		const absolutePath = resolve(ctx.workingDir, dirPath);

		const entries = await readdir(absolutePath, { withFileTypes: true });
		const results: string[] = [];

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const type = entry.isDirectory() ? "DIR" : "FILE";
			const fullPath = resolve(absolutePath, entry.name);
			try {
				const s = await stat(fullPath);
				results.push(`${type}  ${entry.name}  (${s.size} bytes)`);
			} catch {
				results.push(`${type}  ${entry.name}  (unreadable)`);
			}
		}

		return results.length > 0 ? results.join("\n") : "(empty directory)";
	}
}
