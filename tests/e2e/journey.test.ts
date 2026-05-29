import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { AgentRuntime } from "../../packages/agent-runtime/src/agent-runtime.ts";
import { FallbackChain } from "../../packages/agent-runtime/src/llm-router/fallback-chain.ts";
import type { ProviderLike } from "../../packages/agent-runtime/src/llm-router/fallback-chain.ts";
import type { AgentMessage } from "../../packages/agent-runtime/src/types.ts";

const tmpBase = join(import.meta.dir, "__tmp_journey__");

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

describe("E2E Journey Tests", () => {
	beforeEach(async () => {
		await mkdir(tmpBase, { recursive: true });
	});

	afterEach(async () => {
		const { existsSync } = await import("fs");
		if (existsSync(tmpBase)) {
			await rm(tmpBase, { recursive: true, force: true });
		}
	});

	// E-01: Simple Q&A journey
	it("E-01: simple Q&A returns answer content", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Paris is the capital of France.",
			toolCalls: [],
			timestamp: Date.now(),
		}));

		const runtime = new AgentRuntime(makeConfig({ chatFn }));
		const result = await runtime.run([
			{ role: "user", content: "What is the capital of France?", timestamp: Date.now() },
		]);

		expect(result.some((m) => m.content.includes("Paris"))).toBe(true);
	});

	// E-02: Tool call journey
	it("E-02: tool call journey executes tool and returns result", async () => {
		let callCount = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callCount++;
			if (callCount === 1) {
				return {
					role: "assistant" as const,
					content: "Let me read that file.",
					toolCalls: [{ id: "tc_read_1", name: "read_file", arguments: '{"path":"/tmp/test.txt"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "The file contains: Hello World",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const toolExecute = vi.fn(async () => "Hello World");

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					{
						name: "read_file",
						description: "Read a file",
						parameters: { type: "object" },
						execute: toolExecute,
					},
				],
			}),
		);

		const result = await runtime.run([{ role: "user", content: "Read the file test.txt", timestamp: Date.now() }]);

		expect(toolExecute).toHaveBeenCalledTimes(1);
		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages.length).toBe(1);
		expect(toolMessages[0].content).toContain("Hello World");
	});

	// E-03: Multi-turn context - runtime is stateless between run() calls,
	// so caller must pass accumulated messages to preserve context
	it("E-03: multi-turn context carries history when caller passes accumulated messages", async () => {
		const callHistory: AgentMessage[][] = [];
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callHistory.push([...messages]);
			return {
				role: "assistant" as const,
				content: "Acknowledged.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn }));

		const turn1Result = await runtime.run([{ role: "user", content: "First turn message", timestamp: Date.now() }]);

		// Pass the full conversation from turn 1 into turn 2
		await runtime.run([...turn1Result, { role: "user", content: "Second turn message", timestamp: Date.now() }]);

		// The second chatFn call should receive messages that include context from the first turn
		expect(callHistory.length).toBeGreaterThanOrEqual(2);
		const secondCallMessages = callHistory[1];
		const allContent = secondCallMessages.map((m) => m.content).join(" ");
		expect(allContent).toContain("First turn message");
	});

	// E-04: Compaction trigger
	it("E-04: compaction triggers when over token budget", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Ok.",
			toolCalls: [],
			timestamp: Date.now(),
		}));

		const compactFn = vi.fn(async (msgs: AgentMessage[]) => ({
			level: 3,
			applied: true,
			tokensFreed: 5000,
			summary: "Compacted conversation summary",
		}));

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				compactFn,
				compactionConfig: { maxTokens: 10 },
			}),
		);

		await runtime.run([
			{
				role: "user",
				content:
					"A very long message that exceeds the tiny token budget we set for testing compaction behavior in the runtime",
				timestamp: Date.now(),
			},
		]);

		expect(compactFn).toHaveBeenCalled();
	});

	// E-05: Provider fallback
	it("E-05: fallback chain tries next provider on failure", async () => {
		const primaryProvider: ProviderLike = {
			name: "primary",
			chat: vi.fn(async () => {
				throw new Error("Primary provider down");
			}),
			embed: vi.fn(async () => [0.1, 0.2]),
		};

		const fallbackProvider: ProviderLike = {
			name: "fallback",
			chat: vi.fn(async () => ({
				role: "assistant",
				content: "Fallback response",
				toolCalls: [],
				timestamp: Date.now(),
			})),
			embed: vi.fn(async () => [0.3, 0.4]),
		};

		const chain = new FallbackChain([primaryProvider, fallbackProvider]);
		const response = await chain.chat({
			messages: [{ role: "user", content: "test" }],
			maxTokens: 100,
		});

		expect(primaryProvider.chat).toHaveBeenCalledTimes(1);
		expect(fallbackProvider.chat).toHaveBeenCalledTimes(1);
		expect(response.content).toContain("Fallback");
	});

	// E-06: Abort and resume - test that a failed run on one runtime instance
	// does not prevent a new runtime from working correctly
	it("E-06: aborted run does not prevent subsequent runs on a new runtime", async () => {
		const chatFn1 = vi.fn(async (messages: AgentMessage[]) => {
			throw new Error("Simulated abort error");
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn: chatFn1, maxIterations: 1 }));

		// First run fails due to chatFn throwing
		await expect(runtime.run([{ role: "user", content: "First", timestamp: Date.now() }])).rejects.toThrow(
			"Simulated abort error",
		);

		// Create a fresh runtime with a working chatFn
		const chatFn2 = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Resumed successfully.",
			toolCalls: [],
			timestamp: Date.now(),
		}));

		const runtime2 = new AgentRuntime(makeConfig({ chatFn: chatFn2, maxIterations: 1 }));

		const result = await runtime2.run([{ role: "user", content: "Second attempt", timestamp: Date.now() }]);

		expect(result.some((m) => m.role === "assistant")).toBe(true);
	});
});
