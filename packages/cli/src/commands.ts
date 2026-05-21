export interface ParsedArgs {
	command: string;
	mode?: string;
	configPath?: string;
}

export const COMMANDS = new Set(["gateway-start", "tui", "help"]);

export function parseArgs(args: string[]): ParsedArgs {
	if (args.length === 0) return { command: "help" };

	const first = args[0];

	if (first === "gateway" && args[1] === "start") {
		const configIdx = args.indexOf("--config");
		return {
			command: "gateway-start",
			configPath: configIdx >= 0 ? args[configIdx + 1] : undefined,
		};
	}

	if (first === "tui") {
		const modeIdx = args.indexOf("--mode");
		return {
			command: "tui",
			mode: modeIdx >= 0 ? args[modeIdx + 1] : "embedded",
		};
	}

	if (COMMANDS.has(first)) return { command: first };

	return { command: "help" };
}
