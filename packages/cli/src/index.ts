import { homedir } from "os";
import { join } from "path";
import { buildChatFn, type AgentRuntime, type AgentMessage, type ToolSchema } from "@miniclaw/agent-runtime";
import { Gateway, MemoryStore } from "@miniclaw/gateway";
import { render, Box } from "ink";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { parseArgs } from "./commands.ts";
import { ConfigStore, type ProviderConfig, type ProviderType } from "./config-store.ts";
import { TUIApp, type TUIState } from "./tui/app.tsx";
import type { RichMessage } from "./tui/messages.ts";
import { StartupSplash, type InitStep } from "./tui/splash.tsx";
import { SetupWizard } from "./tui/wizard.tsx";

const CONFIG_DIR = join(homedir(), ".miniclaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

function ChatScreen({
	config,
	runtime,
	store,
	onExit,
}: { config: ProviderConfig; runtime: AgentRuntime; store: MemoryStore; onExit: () => void }) {
	const [sessionId] = useState(() => crypto.randomUUID().slice(0, 8));
	const [state, setState] = useState<TUIState>("idle");
	const [messages, setMessages] = useState<RichMessage[]>([]);
	const [tokenCount, setTokenCount] = useState(0);
	const [uptime, setUptime] = useState("0m");
	const [errorMessage, setErrorMessage] = useState<string>();
	const [currentToolName, setCurrentToolName] = useState<string>();
	const startTime = useRef(Date.now());
	const conversationHistory = useRef<AgentMessage[]>([]);
	const abortRef = useRef<AbortController | null>(null);
	const runningRef = useRef(false);

	useEffect(() => {
		runtime.onReply((text) => {
			if (text.trim()) {
				setMessages((prev) => [...prev, { type: "assistant_text", content: text }]);
			}
		});

		runtime.onToolCallStart((call, text) => {
			setState("tool_call");
			setCurrentToolName(call.name);
			const msg: RichMessage = { type: "assistant_tool_use" as const, toolCall: call, status: "running" as const };
			if (text.trim()) {
				setMessages((prev) => [...prev, { type: "assistant_text", content: text }, msg]);
			} else {
				setMessages((prev) => [...prev, msg]);
			}
		});

		runtime.onToolCall((_call, _result) => {
			setState("thinking");
			setCurrentToolName(undefined);
			setMessages((prev) =>
				prev.map((msg) =>
					msg.type === "assistant_tool_use" && msg.toolCall.id === _call.id
						? { ...msg, status: (_result.isError ? "error" : "done") as "done" | "error", result: _result }
						: msg,
				),
			);
		});

		runtime.onCompact((summary) => {
			setMessages((prev) => [
				...prev,
				{ type: "compact_boundary" as const },
			]);
		});
	}, [runtime]);

	useEffect(() => {
		const id = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime.current) / 60000);
			setUptime(elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`);
		}, 10000);
		return () => clearInterval(id);
	}, []);

	const handleAbort = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
			setMessages((prev) => [...prev, { type: "system_text", content: "已中断" }]);
			setState("idle");
		}
	}, []);

	const handleSubmit = useCallback(
		async (text: string) => {
			if (runningRef.current) return;
			if (text === "exit" || text === "quit") {
				onExit();
				return;
			}

			runningRef.current = true;
			setMessages((prev) => [...prev, { type: "user_text", content: text }]);
			setState("thinking");
			setErrorMessage(undefined);

			const ac = new AbortController();
			abortRef.current = ac;

			try {
				conversationHistory.current.push({ role: "user", content: text, timestamp: Date.now() });
				const result = await runtime.run(conversationHistory.current, { signal: ac.signal });

				conversationHistory.current = [...result];

				const tokens = Math.ceil(conversationHistory.current.reduce((sum, m) => sum + m.content.length, 0) / 4);
				setTokenCount(tokens);

				await store.create({ content: text, type: "user" });
				const lastAssistantText = [...result].reverse().find((m) => m.role === "assistant" && m.content.trim());
				if (lastAssistantText) {
					await store.create({ content: lastAssistantText.content, type: "feedback" });
				}
			} catch (err) {
				if (ac.signal.aborted) {
					runningRef.current = false;
					return;
				}
				const msg = err instanceof Error ? err.message : String(err);
				setMessages((prev) => [...prev, { type: "system_text", content: `Error: ${msg}` }]);
				setErrorMessage(msg);
				setState("error");
				runningRef.current = false;
				return;
			}

			abortRef.current = null;
			runningRef.current = false;
			setState("idle");
		},
		[runtime, store, onExit],
	);

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
		toolName: currentToolName,
		messages,
		onSubmit: handleSubmit,
		onExit,
		onAbort: handleAbort,
		errorMessage,
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
			console.error("Setup incomplete. Run `miniclaw tui` again.");
			return;
		}
		config = newConfig;
	}

	if (mode === "gateway") {
		console.log("Gateway mode not yet implemented (v1.1). Use embedded mode.");
		return;
	}

	// Render immediately — splash runs init steps inside the render tree
	const initCtx = { config } as Record<string, unknown>;

	const { waitUntilExit } = render(
		React.createElement(function AppShell() {
			const [ready, setReady] = useState(false);
			const handleDone = React.useCallback(() => setReady(true), []);

			const initSteps = React.useMemo<InitStep[]>(
				() => [
					{
						label: "Memory Core",
						task: async () => {
							const { MemoryStore: MS } = await import("@miniclaw/gateway");
							const sessionDir = join(CONFIG_DIR, "sessions");
							const s = new MS(sessionDir);
							await s.init();
							initCtx.store = s;
						},
					},
					{
						label: "Session Manager",
						task: async () => {
							const { Gateway: GW } = await import("@miniclaw/gateway");
							const sessionDir = join(CONFIG_DIR, "sessions");
							const gw = new GW({ sessionDir });
							gw.setMemoryStore(initCtx.store as MemoryStore);
							await gw.start();
							initCtx.gateway = gw;
						},
					},
					{
						label: "LLM Router",
						task: async () => {
							initCtx.chatFn = await buildChatFn(config);
						},
					},
					{
						label: "Plugin Registry",
						task: async () => {
							const { BashTool, ReadFileTool, ListFilesTool } = await import("@miniclaw/agent-runtime");
							initCtx.tools = [new BashTool().definition, new ReadFileTool().definition, new ListFilesTool().definition];
						},
					},
					{
						label: "Agent Runtime",
						task: async () => {
							const { AgentRuntime: AR } = await import("@miniclaw/agent-runtime");
							initCtx.runtime = new AR({
								chatFn: initCtx.chatFn as any,
								baseSystemPrompt:
									"You are miniclaw, a helpful AI assistant. You have tools: bash (execute commands), read_file (read file contents), list_files (list directory contents).\n\nRules:\n1. Use tools when the user asks about files or system operations.\n2. After receiving tool results, ALWAYS respond with a text summary of the outcome. Do NOT make additional tool calls unless the user's request genuinely requires more actions.\n3. If a tool call fails, explain the error and suggest alternatives - do not retry the same command.",
								tools: initCtx.tools as any[],
								workingDir: process.cwd(),
							});
						},
					},
				],
				[config],
			);

			return React.createElement(
				Box,
				{ flexDirection: "column" },
				React.createElement(StartupSplash, {
					provider: config.provider,
					model: config.model,
					initSteps,
					onDone: handleDone,
					collapsed: ready,
				}),
				ready
					? React.createElement(ChatScreen, {
							config,
							runtime: initCtx.runtime as AgentRuntime,
							store: initCtx.store as MemoryStore,
							onExit: () => process.exit(0),
						})
					: null,
			);
		}),
	);

	await waitUntilExit();
	const gw = initCtx.gateway as Gateway | undefined;
	if (gw) await gw.stop();
}

async function runGatewayStart(configPath?: string): Promise<void> {
	const sessionDir = join(CONFIG_DIR, "sessions");
	const store = new MemoryStore(sessionDir);
	await store.init();

	let gatewayConfig: Record<string, unknown> | undefined;
	if (configPath) {
		const { readFile } = await import("fs/promises");
		const YAML = (await import("yaml")).default;
		const content = await readFile(configPath, "utf-8");
		gatewayConfig = YAML.parse(content) as Record<string, unknown>;
	}

	const gw = new Gateway({
		sessionDir,
		config: gatewayConfig,
	});
	gw.setMemoryStore(store);

	// Load provider config and inject chatFn into Gateway
	const providerConfig = await new ConfigStore(CONFIG_PATH).load();
	if (providerConfig) {
		const chatFn = await buildChatFn(providerConfig);
		gw.setChatFn(chatFn);
	}

	await gw.start();

	// Server main loop runs inside GatewayServer.start()
	// Keep process alive until gateway stops
	await new Promise<void>((resolve) => {
		const check = setInterval(() => {
			if (!gw.isRunning) {
				clearInterval(check);
				resolve();
			}
		}, 1000);
	});
}

async function runHeadless(prompt?: string, configPath?: string): Promise<void> {
	const configStore = new ConfigStore(configPath ?? CONFIG_PATH);
	const config = await configStore.load();
	if (!config) {
		process.stderr.write("No configuration found. Run `miniclaw tui` to set up.\n");
		process.exit(1);
	}

	let userPrompt = prompt;
	if (!userPrompt && !process.stdin.isTTY) {
		userPrompt = await new Promise<string>((resolve, reject) => {
			let data = "";
			process.stdin.setEncoding("utf-8");
			process.stdin.on("data", (chunk: string) => { data += chunk; });
			process.stdin.on("end", () => resolve(data.trim()));
			process.stdin.on("error", reject);
		});
	}
	if (!userPrompt) {
		process.stderr.write("No prompt provided. Usage: miniclaw headless <prompt>  OR  echo <prompt> | miniclaw headless\n");
		process.exit(1);
	}

	const chatFn = await buildChatFn(config);
	const { BashTool, ReadFileTool, ListFilesTool, AgentRuntime: AR } = await import("@miniclaw/agent-runtime");
	const tools = [new BashTool().definition, new ReadFileTool().definition, new ListFilesTool().definition];

	const runtime = new AR({
		chatFn,
		baseSystemPrompt:
			"You are miniclaw, a helpful AI assistant. You have tools: bash (execute commands), read_file (read file contents), list_files (list directory contents).\n\nRules:\n1. Use tools when the user asks about files or system operations.\n2. After receiving tool results, ALWAYS respond with a text summary of the outcome. Do NOT make additional tool calls unless the user's request genuinely requires more actions.\n3. If a tool call fails, explain the error and suggest alternatives - do not retry the same command.",
		tools,
		workingDir: process.cwd(),
	});

	runtime.onStreamChunk((text) => {
		process.stdout.write(text);
	});

	runtime.onToolCallStart((call, text) => {
		if (text.trim()) {
			process.stdout.write("\n" + text + "\n");
		}
		process.stdout.write(`\n[tool:${call.name}] ${call.arguments}\n`);
	});

	runtime.onToolCall((call, result) => {
		const tag = result.isError ? "error" : "result";
		const content = result.content.length > 2000
			? result.content.slice(0, 2000) + "\n... (truncated)"
			: result.content;
		process.stdout.write(`[tool:${tag}:${call.name}]\n${content}\n`);
	});

	const ac = new AbortController();
	let sigintCount = 0;
	const onSigint = () => {
		sigintCount++;
		if (sigintCount >= 2) process.exit(130);
		process.stderr.write("\nInterrupted. Press Ctrl+C again to force exit.\n");
		ac.abort();
	};
	process.on("SIGINT", onSigint);

	const messages: AgentMessage[] = [
		{ role: "user", content: userPrompt, timestamp: Date.now() },
	];

	try {
		await runtime.run(messages, { signal: ac.signal });
		process.stdout.write("\n");
	} catch (err) {
		if (ac.signal.aborted) process.exit(130);
		process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exit(1);
	} finally {
		process.removeListener("SIGINT", onSigint);
	}
}

function showHelp(): void {
	console.log(`miniclaw — AI agent framework

Usage:
  miniclaw tui              Start interactive TUI (default, embedded mode)
  miniclaw tui --mode gateway  Connect to gateway daemon (v1.1)
  miniclaw headless <prompt>  Run agent non-interactively, output to stdout
  miniclaw headless            Read prompt from stdin (pipe-friendly)
  miniclaw gateway start    Start gateway daemon
  miniclaw gateway start --config <path>  Start with config file
  miniclaw help             Show this help

Headless mode:
  Accepts prompt as a CLI argument or via stdin.
  Output is plain text to stdout; tool calls appear as [tool:...] lines.
  Exit code 0 on success, 1 on error, 130 on SIGINT.

  Examples:
    miniclaw headless "list files in /tmp"
    echo "list files" | miniclaw headless
    cat prompt.txt | miniclaw headless

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
		case "headless":
			await runHeadless(parsed.prompt, parsed.configPath);
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
