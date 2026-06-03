export interface ParsedArgs {
	command: string;
	mode?: string;
	configPath?: string;
	prompt?: string;
}

export const COMMANDS = new Set(["gateway-start", "tui", "headless", "help"]);

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

	if (first === "headless") {
		const rest = args.slice(1);
		const configIdx = rest.indexOf("--config");
		let configPath: string | undefined;
		let promptParts: string[] = [];

		if (configIdx >= 0) {
			configPath = rest[configIdx + 1];
			promptParts = [...rest.slice(0, configIdx), ...rest.slice(configIdx + 2)];
		} else {
			promptParts = rest;
		}

		return {
			command: "headless",
			prompt: promptParts.length > 0 ? promptParts.join(" ") : undefined,
			configPath,
		};
	}

	if (COMMANDS.has(first)) return { command: first };

	return { command: "help" };
}
