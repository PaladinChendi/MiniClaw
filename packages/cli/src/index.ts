import { homedir } from "os";
import { join } from "path";
import { AgentRuntime } from "@ebsclaw/agent-runtime";
import type { AgentMessage } from "@ebsclaw/agent-runtime";
import { Gateway, MemoryStore } from "@ebsclaw/gateway";
import { render } from "ink";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { parseArgs } from "./commands.ts";
import { ConfigStore, type ProviderConfig, type ProviderType } from "./config-store.ts";
import { TUIApp, type ChatMessage, type TUIState } from "./tui/app.tsx";
import { SetupWizard } from "./tui/wizard.tsx";
import { StartupSplash } from "./tui/splash.tsx";

const CONFIG_DIR = join(homedir(), ".ebsclaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

async function buildChatFn(config: ProviderConfig): Promise<(messages: AgentMessage[]) => Promise<AgentMessage>> {
	const apiKey = config.apiKey;
	const baseUrl = config.baseUrl || undefined;
	const model = config.model;

	// Anthropic native SDK
	if (config.provider === "anthropic" || model.includes("claude")) {
		const { default: Anthropic } = await import("@anthropic-ai/sdk");
		const client = new Anthropic({ apiKey, baseURL: baseUrl });
		return async (msgs: AgentMessage[]) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const userMsgs = msgs.filter((m) => m.role !== "system");
			const lastUser = userMsgs.filter((m) => m.role === "user").pop();
			const res = await client.messages.create({
				model,
				max_tokens: 4096,
				messages: [{ role: "user", content: lastUser?.content ?? "" }],
				...(system ? { system } : {}),
			});
			const text = res.content.find((b: any) => b.type === "text") as { type: "text"; text: string } | undefined;
			return { role: "assistant", content: text?.text ?? "", timestamp: Date.now() };
		};
	}

	// kcode — Anthropic messages format via fetch, with Bearer auth + custom header
	if (config.provider === "kcode") {
		const endpoint = (baseUrl || "").replace(/\/$/, "") + "/messages";
		return async (msgs: AgentMessage[]) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const apiMsgs = msgs
				.filter((m) => m.role !== "system")
				.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
					"ksyun-code-type": "kscc-cli",
				},
				body: JSON.stringify({
					model,
					max_tokens: 4096,
					messages: apiMsgs,
					...(system ? { system } : {}),
				}),
			});
			if (!res.ok) {
				const err = await res.text();
				throw new Error(`${res.status} ${err}`);
			}
			const data = await res.json() as any;
			const block = data.content?.find((b: any) => b.type === "text");
			return { role: "assistant", content: block?.text ?? "", timestamp: Date.now() };
		};
	}

	// OpenAI-compatible (openai, deepseek, custom, etc.)
	const { default: OpenAI } = await import("openai");
	const client = new OpenAI({ apiKey, baseURL: baseUrl });
	return async (msgs: AgentMessage[]) => {
		const apiMsgs = msgs
			.filter((m) => m.role !== "tool")
			.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content }));
		const res = await client.chat.completions.create({ model, messages: apiMsgs });
		return { role: "assistant", content: res.choices[0]?.message?.content ?? "", timestamp: Date.now() };
	};
}

function ChatScreen({ config, runtime, store }: { config: ProviderConfig; runtime: AgentRuntime; store: MemoryStore }) {
	const sessionId = crypto.randomUUID().slice(0, 8);
	const [state, setState] = useState<TUIState>("idle");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [tokenCount, setTokenCount] = useState(0);
	const [uptime, setUptime] = useState("0m");
	const startTime = useRef(Date.now());
	const conversationHistory = useRef<AgentMessage[]>([]);

	useEffect(() => {
		const id = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime.current) / 60000);
			setUptime(elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`);
		}, 10000);
		return () => clearInterval(id);
	}, []);

	const handleSubmit = useCallback(async (text: string) => {
		if (text === "exit" || text === "quit") {
			process.exit(0);
		}

		const userMsg: ChatMessage = { role: "user", content: text };
		setMessages((prev) => [...prev, userMsg]);
		setState("thinking");

		try {
			conversationHistory.current.push({ role: "user", content: text, timestamp: Date.now() });
			const result = await runtime.run(conversationHistory.current);
			const assistantMsg = result[result.length - 1];

			conversationHistory.current = [...result];

			if (assistantMsg?.content) {
				const agentMsg: ChatMessage = { role: "agent", content: assistantMsg.content };
				setMessages((prev) => [...prev, agentMsg]);
			}

			const tokens = Math.ceil(conversationHistory.current.reduce((sum, m) => sum + m.content.length, 0) / 4);
			setTokenCount(tokens);

			await store.create({ content: text, type: "user" });
			if (assistantMsg?.content) {
				await store.create({ content: assistantMsg.content, type: "feedback" });
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [...prev, { role: "agent", content: `Error: ${msg}` }]);
		}

		setState("idle");
	}, [runtime, store]);

	return React.createElement(TUIApp, {
		state,
		provider: config.provider,
				model: config.model,
		sessionId,
		tokenCount,
		tokenPercent: Math.min(Math.floor((tokenCount / 8000) * 100), 100),
		pluginCount: 3,
		memoryCount: 0,
		uptime,
		messages,
		onSubmit: handleSubmit,
		onExit: () => process.exit(0),
	});
}

async function runTUI(mode?: string): Promise<void> {
	const configStore = new ConfigStore(CONFIG_PATH);
	let config = await configStore.load();

	if (!config) {
		const { waitUntilExit } = render(
			React.createElement(SetupWizard, {
				configStore,
				onComplete() {},
			}),
		);
		await waitUntilExit();
		const newConfig = await configStore.load();
		if (!newConfig) {
			console.error("Setup incomplete. Run `ebsclaw tui` again.");
			return;
		}
		config = newConfig;
	}

	if (mode === "gateway") {
		console.log("Gateway mode not yet implemented (v1.1). Use embedded mode.");
		return;
	}

	const sessionDir = join(CONFIG_DIR, "sessions");
	const store = new MemoryStore(sessionDir);
	await store.init();
	const gw = new Gateway({ sessionDir });
	gw.setMemoryStore(store);
	await gw.start();

	const chatFn = await buildChatFn(config);
	const runtime = new AgentRuntime({
		chatFn,
		baseSystemPrompt: "You are ebsclaw, a helpful AI assistant.",
	});

	// Show startup splash, then transition to chat
	const splashDone = new Promise<void>((resolve) => {
		const { unmount } = render(
			React.createElement(StartupSplash, {
				provider: config.provider,
				model: config.model,
				onDone: () => {
					unmount();
					resolve();
				},
			}),
		);
	});
	await splashDone;

	const { waitUntilExit } = render(
		React.createElement(ChatScreen, { config, runtime, store }),
	);

	await waitUntilExit();
	await gw.stop();
}

async function runGatewayStart(configPath?: string): Promise<void> {
	const sessionDir = join(CONFIG_DIR, "sessions");
	const store = new MemoryStore(sessionDir);
	await store.init();

	const gw = new Gateway({
		sessionDir,
		config: configPath ? undefined : undefined,
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
