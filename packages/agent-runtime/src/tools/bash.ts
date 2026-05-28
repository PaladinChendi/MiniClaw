import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

const WRITE_COMMANDS = ["rm", "mv", "cp", "mkdir", "touch", "chmod", "chown", "dd", "mkfs", ">", ">>"];

export class BashTool {
	get definition(): ToolDefinition {
		return {
			name: "bash",
			description:
				"Execute a bash command. Read-only by default — write commands are blocked unless readOnly is false.",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string", description: "The bash command to execute" },
				},
				required: ["command"],
			},
			execute: (args, ctx) => this.execute(args, ctx),
		};
	}

	async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
		const command = args.command as string;
		if (!command) throw new Error("command is required");

		if (ctx.readOnly) {
			const normalizedCmd = command.trim().toLowerCase();
			for (const wc of WRITE_COMMANDS) {
				if (normalizedCmd.startsWith(wc) || normalizedCmd.includes(` ${wc} `)) {
					throw new Error(`Command blocked in read-only mode: contains "${wc}"`);
				}
			}
		}

		const proc = Bun.spawn(["bash", "-c", command], {
			cwd: ctx.workingDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		if (exitCode !== 0) {
			return `Exit code ${exitCode}\n${stdout}${stderr}`;
		}
		return stdout || "(no output)";
	}
}
