import { describe, it, expect, vi } from "bun:test";
import { AgentRuntime } from "../src/agent-runtime.ts";
import type { AgentMessage, ToolResult } from "../src/types.ts";

describe("AgentRuntime", () => {
	function makeConfig(overrides: Record<string, unknown> = {}) {
		return {
			chatFn: vi.fn(async (messages: AgentMessage[]) => ({
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			})),
			baseSystemPrompt: "You are a helpful assistant.",
			tools: [],
			maxIterations: 10,
			workingDir: "/tmp",
			readOnly: false,
			...overrides,
		};
	}

	it("completes a single-turn conversation", async () => {
		const config = makeConfig();
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([
			{ role: "user", content: "Hello!", timestamp: Date.now() },
		]);
		expect(result.length).toBeGreaterThan(1);
		expect(result.some((m) => m.role === "assistant")).toBe(true);
	});

	it("loops through tool calls until end_turn", async () => {
		let callCount = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callCount++;
			if (callCount === 1) {
				return {
					role: "assistant" as const,
					content: "Let me check.",
					toolCalls: [
						{ id: "tc1", name: "read_file", arguments: '{"path":"/tmp/test.txt"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "The file exists.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const toolExecute = vi.fn(async () => "file contents here");
		const config = makeConfig({
			chatFn,
			tools: [
				{
					name: "read_file",
					description: "Read a file",
					parameters: { type: "object" },
					execute: toolExecute,
				},
			],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([
			{ role: "user", content: "Read the file", timestamp: Date.now() },
		]);

		expect(chatFn).toHaveBeenCalledTimes(2);
		expect(toolExecute).toHaveBeenCalledTimes(1);
		expect(result.filter((m) => m.role === "tool")).toHaveLength(1);
	});

	it("triggers compaction when over budget", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Ok.",
			toolCalls: [],
			timestamp: Date.now(),
		}));
		const compactFn = vi.fn(async (msgs: AgentMessage[]) => ({
			messages: [{ role: "system" as const, content: "Compacted", timestamp: Date.now() }],
			results: [{ level: 1, applied: true, tokensFreed: 1000 }],
			totalTokensFreed: 1000,
		}));

		const config = makeConfig({
			chatFn,
			compactFn,
			compactionConfig: { maxTokens: 10 },
		});
		const runtime = new AgentRuntime(config);
		await runtime.run([
			{ role: "user", content: "A very long message that exceeds the tiny token budget we set for testing compaction", timestamp: Date.now() },
		]);

		expect(compactFn).toHaveBeenCalled();
	});

	it("emits streaming chunks via onStreamChunk", async () => {
		const chunks: string[] = [];
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Streaming reply.",
			toolCalls: [],
			timestamp: Date.now(),
		}));

		const config = makeConfig({ chatFn });
		const runtime = new AgentRuntime(config);
		runtime.onStreamChunk((text: string) => chunks.push(text));
		await runtime.run([
			{ role: "user", content: "Hi", timestamp: Date.now() },
		]);

		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	it("aborts when signal is triggered", async () => {
		const controller = new AbortController();
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			controller.abort();
			return {
				role: "assistant" as const,
				content: "Working...",
				toolCalls: [
					{ id: "tc1", name: "bash", arguments: '{"command":"sleep 10"}' },
				],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [
				{
					name: "bash",
					description: "Run command",
					parameters: { type: "object" },
					execute: async () => "done",
				},
			],
		});
		const runtime = new AgentRuntime(config);
		await expect(
			runtime.run([{ role: "user", content: "Go", timestamp: Date.now() }], { signal: controller.signal }),
		).rejects.toThrow("Aborted");
	});
});
