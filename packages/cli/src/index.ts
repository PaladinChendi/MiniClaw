import { homedir } from "os";
import { join } from "path";
import { Gateway, MemoryStore } from "@ebsclaw/gateway";
import { render } from "ink";
import React from "react";
import { parseArgs } from "./commands.ts";
import { ConfigStore } from "./config-store.ts";
import { TUIApp } from "./tui/app.tsx";
import { SetupWizard } from "./tui/wizard.tsx";

const CONFIG_DIR = join(homedir(), ".ebsclaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

async function runTUI(mode?: string): Promise<void> {
	const configStore = new ConfigStore(CONFIG_PATH);
	const config = await configStore.load();

	// First-run: launch setup wizard
	if (!config) {
		const { waitUntilExit } = render(React.createElement(SetupWizard, { step: 0 }));
		await waitUntilExit();
		// After wizard, reload config
		const newConfig = await configStore.load();
		if (!newConfig) {
			console.error("Setup incomplete. Run `ebsclaw tui` again.");
			return;
		}
	}

	if (mode === "gateway") {
		console.log("Gateway mode not yet implemented (v1.1). Use embedded mode.");
		return;
	}

	// Embedded mode: start Gateway in-process
	const sessionDir = join(CONFIG_DIR, "sessions");
	const store = new MemoryStore(sessionDir);
	await store.init();
	const gw = new Gateway({ sessionDir });
	gw.setMemoryStore(store);
	await gw.start();

	// Determine provider from config for display
	const provider = config?.provider ?? "unknown";

	// Render TUI
	const { rerender, waitUntilExit } = render(React.createElement(TUIApp, { state: "idle" }));

	// Simple REPL loop
	const readline = await import("readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "> ",
	});

	rl.prompt();

	rl.on("line", async (line) => {
		const input = line.trim();
		if (!input) {
			rl.prompt();
			return;
		}
		if (input === "exit" || input === "quit") {
			rl.close();
			return;
		}

		// Update TUI state to thinking
		rerender(React.createElement(TUIApp, { state: "thinking" }));

		try {
			// Store user message in memory
			await store.create({ content: input, type: "user" });

			// Update TUI to idle after processing
			rerender(React.createElement(TUIApp, { state: "idle" }));
		} catch (err) {
			rerender(
				React.createElement(TUIApp, {
					state: "error",
					errorMessage: err instanceof Error ? err.message : String(err),
				}),
			);
		}

		rl.prompt();
	});

	rl.on("close", async () => {
		await gw.stop();
		process.exit(0);
	});

	await waitUntilExit();
}

async function runGatewayStart(configPath?: string): Promise<void> {
	const sessionDir = join(CONFIG_DIR, "sessions");
	const store = new MemoryStore(sessionDir);
	await store.init();

	const gw = new Gateway({
		sessionDir,
		config: configPath ? undefined : undefined, // TODO: load from configPath
	});
	gw.setMemoryStore(store);
	await gw.start();

	console.log(`ebsclaw gateway started (mode: ${gw.mode})`);
	console.log("Press Ctrl+C to stop");

	process.on("SIGINT", async () => {
		await gw.stop();
		process.exit(0);
	});
}

function showHelp(): void {
	console.log(`ebsclaw — AI agent framework

Usage:
  ebsclaw tui              Start interactive TUI (default, embedded mode)
  ebsclaw tui --mode gateway  Connect to gateway daemon (v1.1)
  ebsclaw gateway start    Start gateway daemon
  ebsclaw gateway start --config <path>  Start with config file
  ebsclaw help             Show this help

Configuration:
  ${CONFIG_PATH}
  First run launches a setup wizard for provider + API key.
`);
}

async function main(): Promise<void> {
	const parsed = parseArgs(process.argv.slice(2));

	switch (parsed.command) {
		case "tui":
			await runTUI(parsed.mode);
			break;
		case "gateway-start":
			await runGatewayStart(parsed.configPath);
			break;
		default:
			showHelp();
			break;
	}
}

main().catch((err) => {
	console.error("Fatal:", err instanceof Error ? err.message : err);
	process.exit(1);
});
