import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

const WRITE_COMMANDS = ["rm", "mv", "cp", "mkdir", "touch", "chmod", "chown", "dd", "mkfs", ">", ">>"];
const DEFAULT_TIMEOUT_MS = 30_000;

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
					timeout: { type: "number", description: `Timeout in ms (default ${DEFAULT_TIMEOUT_MS})` },
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

		const timeoutMs = (args.timeout as number) || DEFAULT_TIMEOUT_MS;
		const proc = Bun.spawn(["bash", "-c", command], {
			cwd: ctx.workingDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		let timer: ReturnType<typeof setTimeout> | undefined;
		let onAbort: (() => void) | undefined;
		let killed = false;

		const cleanup = () => {
			if (timer !== undefined) clearTimeout(timer);
			if (onAbort && ctx.signal) ctx.signal.removeEventListener("abort", onAbort);
		};

		const killGroup = () => {
			if (killed) return;
			killed = true;
			try {
				process.kill(-proc.pid, "SIGKILL");
			} catch {
				proc.kill("SIGKILL");
			}
		};

		try {
			const result = await new Promise<{ exitCode: number; stdout: string; stderr: string } | null>(
				(resolve) => {
					const fail = (_msg: string) => {
						killGroup();
						const timeout = setTimeout(() => resolve(null), 200);
						proc.exited.finally(() => clearTimeout(timeout));
					};

					if (ctx.signal?.aborted) {
						fail("Command aborted");
						return;
					}

					onAbort = () => fail("Command aborted");
					ctx.signal?.addEventListener("abort", onAbort, { once: true });

					timer = setTimeout(() => fail(`Command timed out after ${timeoutMs}ms`), timeoutMs);

					(async () => {
						const exitCode = await proc.exited;
						const stdout = await new Response(proc.stdout).text();
						const stderr = await new Response(proc.stderr).text();
						cleanup();
						resolve({ exitCode, stdout, stderr });
					})();
				},
			);

			if (result === null) {
				try {
					const stderr = await new Response(proc.stderr).text();
					return `Command aborted or timed out\n${stderr}`;
				} catch {
					return "Command aborted or timed out";
				}
			}

			if (result.exitCode !== 0) {
				return `Exit code ${result.exitCode}\n${result.stdout}${result.stderr}`;
			}
			return result.stdout || "(no output)";
		} finally {
			cleanup();
		}
	}
}
