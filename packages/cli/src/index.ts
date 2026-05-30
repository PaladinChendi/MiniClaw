import { homedir } from "os";
import { join } from "path";
import type { AgentRuntime, AgentMessage, ToolSchema } from "@ebsclaw/agent-runtime";
import { Gateway, MemoryStore } from "@ebsclaw/gateway";
import { render, Box } from "ink";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { parseArgs } from "./commands.ts";
import { ConfigStore, type ProviderConfig, type ProviderType } from "./config-store.ts";
import { TUIApp, type TUIState } from "./tui/app.tsx";
import type { RichMessage } from "./tui/messages.ts";
import { StartupSplash, type InitStep } from "./tui/splash.tsx";
import { SetupWizard } from "./tui/wizard.tsx";

const CONFIG_DIR = join(homedir(), ".ebsclaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

function toAnthropicApiMsgs(msgs: AgentMessage[]): any[] {
	const filtered = msgs.filter((m) => m.role !== "system");
	const result: any[] = [];
	for (const m of filtered) {
		if (m.role === "tool" && m.toolCallId) {
			const last = result[result.length - 1];
			if (last?.role === "user" && Array.isArray(last.content)) {
				last.content.push({ type: "tool_result", tool_use_id: m.toolCallId, content: m.content });
			} else {
				result.push({
					role: "user",
					content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
				});
			}
		} else if (m.role === "assistant" && m.toolCalls?.length) {
			const content: any[] = [];
			if (m.content) content.push({ type: "text", text: m.content });
			for (const tc of m.toolCalls) {
				content.push({ type: "tool_use", id: tc.id, name: tc.name, input: JSON.parse(tc.arguments) });
			}
			result.push({ role: "assistant", content });
		} else {
			result.push({ role: m.role as "user" | "assistant", content: m.content });
		}
	}
	return result;
}

async function buildChatFn(
	config: ProviderConfig,
): Promise<(messages: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => Promise<AgentMessage>> {
	const apiKey = config.apiKey;
	const baseUrl = config.baseUrl || undefined;
	const model = config.model;

	if (config.provider === "anthropic") {
		const { default: Anthropic } = await import("@anthropic-ai/sdk");
		const client = new Anthropic({ apiKey, baseURL: baseUrl });
		return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const apiMsgs = toAnthropicApiMsgs(msgs);
			const apiTools = tools?.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: { type: "object" as const, ...t.parameters },
			}));
			const res = await client.messages.create(
				{
					model,
					max_tokens: 4096,
					messages: apiMsgs,
					...(system ? { system } : {}),
					...(apiTools?.length ? { tools: apiTools } : {}),
				},
				signal ? { signal } : {},
			);
			const textBlock = res.content.find((b: any) => b.type === "text");
			const toolUseBlocks = res.content.filter((b: any) => b.type === "tool_use");
			return {
				role: "assistant" as const,
				content: (textBlock as any)?.text ?? "",
				toolCalls: toolUseBlocks.map((b: any) => ({
					id: b.id,
					name: b.name,
					arguments: JSON.stringify(b.input),
				})),
				timestamp: Date.now(),
			};
		};
	}

	if (config.provider === "kcode") {
		const endpoint = `${(baseUrl || "").replace(/\/$/, "")}/messages`;
		return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const apiMsgs = toAnthropicApiMsgs(msgs);
			const apiTools = tools?.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: { type: "object" as const, ...t.parameters },
			}));
			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"ksyun-code-type": "kscc-cli",
				},
				body: JSON.stringify({
					model,
					max_tokens: 4096,
					messages: apiMsgs,
					...(system ? { system } : {}),
					...(apiTools?.length ? { tools: apiTools } : {}),
				}),
				signal,
			});
			if (!res.ok) {
				const err = await res.text();
				throw new Error(`${res.status} ${err}`);
			}
			const data = (await res.json()) as any;
			const textBlock = data.content?.find((b: any) => b.type === "text");
			const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === "tool_use");
			return {
				role: "assistant" as const,
				content: (textBlock as any)?.text ?? "",
				toolCalls: toolUseBlocks.map((b: any) => ({
					id: b.id,
					name: b.name,
					arguments: JSON.stringify(b.input),
				})),
				timestamp: Date.now(),
			};
		};
	}

	// OpenAI-compatible (openai, deepseek, custom, etc.)
	const { default: OpenAI } = await import("openai");
	const client = new OpenAI({ apiKey, baseURL: baseUrl });
	return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
		const apiMsgs: any[] = msgs.map((m) => {
			if (m.role === "tool" && m.toolCallId) {
				return { role: "tool" as const, content: m.content, tool_call_id: m.toolCallId };
			}
			if (m.role === "assistant" && m.toolCalls?.length) {
				return {
					role: "assistant" as const,
					content: m.content || null,
					tool_calls: m.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: { name: tc.name, arguments: tc.arguments },
					})),
				};
			}
			return { role: m.role as "system" | "user" | "assistant", content: m.content };
		});
		const apiTools = tools?.map((t) => ({
			type: "function" as const,
			function: { name: t.name, description: t.description, parameters: t.parameters },
		}));
		const res = await client.chat.completions.create(
			{
				model,
				messages: apiMsgs,
				...(apiTools?.length ? { tools: apiTools } : {}),
			},
			signal ? { signal } : {},
		);
		const choice = res.choices[0];
		return {
			role: "assistant" as const,
			content: choice?.message?.content ?? "",
			toolCalls: (choice?.message?.tool_calls ?? []).map((tc: any) => ({
				id: tc.id,
				name: tc.function.name,
				arguments: tc.function.arguments,
			})),
			timestamp: Date.now(),
		};
	};
}

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
				{ type: "compact_summary" as const, content: summary },
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
			if (text === "exit" || text === "quit") {
				onExit();
				return;
			}

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
				if (ac.signal.aborted) return;
				const msg = err instanceof Error ? err.message : String(err);
				setMessages((prev) => [...prev, { type: "system_text", content: `Error: ${msg}` }]);
				setErrorMessage(msg);
				setState("error");
				return;
			}

			abortRef.current = null;
			setState("idle");
		},
		[runtime, store, onExit],
	);

	const handleToggleThinking = useCallback(() => {
		setMessages((prev) =>
			prev.map((msg) => (msg.type === "assistant_thinking" ? { ...msg, expanded: !msg.expanded } : msg)),
		);
	}, []);

	const handleToggleSummary = useCallback(() => {
		setMessages((prev) =>
			prev.map((msg) => (msg.type === "compact_summary" ? { ...msg, expanded: !msg.expanded } : msg)),
		);
	}, []);

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
		onToggleThinking: handleToggleThinking,
		onToggleSummary: handleToggleSummary,
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
			console.error("Setup incomplete. Run `ebsclaw tui` again.");
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

			const initSteps = React.useMemo<InitStep[]>(
				() => [
					{
						label: "Memory Core",
						task: async () => {
							const { MemoryStore: MS } = await import("@ebsclaw/gateway");
							const sessionDir = join(CONFIG_DIR, "sessions");
							const s = new MS(sessionDir);
							await s.init();
							initCtx.store = s;
						},
					},
					{
						label: "Session Manager",
						task: async () => {
							const { Gateway: GW } = await import("@ebsclaw/gateway");
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
							const { BashTool, ReadFileTool, ListFilesTool } = await import("@ebsclaw/agent-runtime");
							initCtx.tools = [new BashTool().definition, new ReadFileTool().definition, new ListFilesTool().definition];
						},
					},
					{
						label: "Agent Runtime",
						task: async () => {
							const { AgentRuntime: AR } = await import("@ebsclaw/agent-runtime");
							initCtx.runtime = new AR({
								chatFn: initCtx.chatFn as any,
								baseSystemPrompt:
									"You are ebsclaw, a helpful AI assistant. You have tools to read files, list directories, and execute bash commands. Use them when the user asks about files or system operations.",
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
					onDone: () => setReady(true),
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
