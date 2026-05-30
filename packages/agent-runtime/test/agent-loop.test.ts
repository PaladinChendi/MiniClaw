import { describe, expect, it, vi } from "bun:test";
import { AgentRuntime } from "../src/agent-runtime.ts";
import type { AgentMessage, ToolCall, ToolExecutionContext, ToolResult } from "../src/types.ts";

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

function makeUserMessage(content = "Hello!"): AgentMessage {
	return { role: "user", content, timestamp: Date.now() };
}

function makeToolDef(
	name = "read_file",
	execute?: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<string>,
) {
	return {
		name,
		description: `A tool called ${name}`,
		parameters: { type: "object" },
		execute: execute ?? (async () => `${name} result`),
	};
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("AgentRuntime - Unit", () => {
	it("U-RT-01: single-turn conversation", async () => {
		const config = makeConfig();
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		expect(result.length).toBeGreaterThan(1);
		expect(result.some((m) => m.role === "assistant")).toBe(true);
		expect(config.chatFn).toHaveBeenCalledTimes(1);
	});

	it("U-RT-02: multi-turn tool loop (3 iterations)", async () => {
		let callCount = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callCount++;
			if (callCount <= 2) {
				return {
					role: "assistant" as const,
					content: `Calling tool, iteration ${callCount}`,
					toolCalls: [
						{
							id: `tc${callCount}`,
							name: "read_file",
							arguments: '{"path":"/tmp/test.txt"}',
						},
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const toolExecute = vi.fn(async () => "file contents here");
		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file", toolExecute)],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage("Read files")]);

		expect(chatFn).toHaveBeenCalledTimes(3);
		expect(toolExecute).toHaveBeenCalledTimes(2);
		expect(result.filter((m) => m.role === "tool")).toHaveLength(2);
	});

	it("U-RT-03: maxIterations truncation", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Keep going.",
			toolCalls: [{ id: "tc-loop", name: "read_file", arguments: '{"path":"/tmp/x"}' }],
			timestamp: Date.now(),
		}));

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
			maxIterations: 2,
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage("Loop me")]);

		expect(chatFn).toHaveBeenCalledTimes(2);
		// No error thrown; returns accumulated messages
		expect(result.length).toBeGreaterThan(0);
	});

	it("U-RT-04: AbortSignal interruption during tool execution", async () => {
		const controller = new AbortController();
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			// Abort after chatFn returns so the abort check hits during tool loop
			controller.abort();
			return {
				role: "assistant" as const,
				content: "Working...",
				toolCalls: [{ id: "tc1", name: "read_file", arguments: '{"path":"/tmp/a"}' }],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);

		await expect(runtime.run([makeUserMessage("Go")], { signal: controller.signal })).rejects.toThrow("Aborted");
	});

	it("U-RT-05: chatFn throws error", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			throw new Error("LLM provider down");
		});

		const config = makeConfig({ chatFn });
		const runtime = new AgentRuntime(config);

		await expect(runtime.run([makeUserMessage()])).rejects.toThrow("LLM provider down");
	});

	it("U-RT-06: tool argument JSON parse failure", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			return {
				role: "assistant" as const,
				content: "Bad args.",
				toolCalls: [{ id: "tc-bad", name: "read_file", arguments: "{invalid json" }],
				timestamp: Date.now(),
			};
		});

		// Second call returns no toolCalls so the loop ends
		const chatFn2 = vi.fn(async (messages: AgentMessage[]) => {
			const call1 = chatFn.mock.results[0]?.value;
			if (call1) {
				return {
					role: "assistant" as const,
					content: "Recovered.",
					toolCalls: [],
					timestamp: Date.now(),
				};
			}
			return call1;
		});

		// Use a single mock that returns bad args first, then stops
		let callIdx = 0;
		const combinedChatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Bad args.",
					toolCalls: [{ id: "tc-bad", name: "read_file", arguments: "{invalid json" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Recovered.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn: combinedChatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(1);
		expect(toolMessages[0].content).toBeTruthy(); // Contains JSON parse error message
	});

	it("U-RT-07: tool execution throws", async () => {
		const failingExecute = vi.fn(async () => {
			throw new Error("Disk full");
		});

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Calling tool.",
					toolCalls: [{ id: "tc-err", name: "read_file", arguments: '{"path":"/tmp/fail"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Recovered.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file", failingExecute)],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(1);
		expect(toolMessages[0].content).toBe("Disk full");
	});

	it("U-RT-08: unknown tool name", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Calling unknown tool.",
					toolCalls: [{ id: "tc-unk", name: "nonexistent_tool", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done anyway.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({ chatFn, tools: [] });
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(1);
		expect(toolMessages[0].content).toContain("Tool not found");
	});

	it("U-RT-09: onReply/onStreamChunk/onToolCall callbacks", async () => {
		const onReplyFn = vi.fn();
		const onStreamChunkFn = vi.fn();
		const onToolCallFn = vi.fn();

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "I'll use the tool.",
					toolCalls: [{ id: "tc-cb", name: "read_file", arguments: '{"path":"/tmp/cb.txt"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Final answer.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		runtime.onReply(onReplyFn);
		runtime.onStreamChunk(onStreamChunkFn);
		runtime.onToolCall(onToolCallFn);

		await runtime.run([makeUserMessage()]);

		// onReply only fires for final text (responses without tool calls)
		expect(onReplyFn).toHaveBeenCalled();
		const replyContents = onReplyFn.mock.calls.map((c: string[]) => c[0]);
		expect(replyContents).toContain("Final answer.");
		expect(replyContents).not.toContain("I'll use the tool.");

		// onStreamChunk should be called at least once
		expect(onStreamChunkFn).toHaveBeenCalled();

		// onToolCall should be called with the tool call and result
		expect(onToolCallFn).toHaveBeenCalledTimes(1);
		const [call, result] = onToolCallFn.mock.calls[0] as [ToolCall, ToolResult];
		expect(call.name).toBe("read_file");
		expect(call.id).toBe("tc-cb");
		expect(result.toolCallId).toBe("tc-cb");
		expect(result.isError).toBe(false);
	});

	it("U-RT-10: compactFn triggered and applied", async () => {
		const compactFn = vi.fn(async (messages: AgentMessage[]) => ({
			level: 1,
			applied: true,
			tokensFreed: 5000,
			summary: "Compacted",
		}));

		const config = makeConfig({
			compactFn,
			// Very low maxTokens so compaction triggers immediately
			compactionConfig: { maxTokens: 1 },
		});
		const runtime = new AgentRuntime(config);

		// Use a message long enough to exceed the tiny budget
		const longMessage = "A".repeat(100);
		const result = await runtime.run([makeUserMessage(longMessage)]);

		expect(compactFn).toHaveBeenCalled();

		// After compaction, the first message should be the system summary
		expect(result[0].role).toBe("system");
		expect(result[0].content).toBe("Compacted");
	});
});

// ---------------------------------------------------------------------------
// State-machine / sequence tests
// ---------------------------------------------------------------------------

describe("AgentRuntime - State Machine", () => {
	it("S-01: START -> LLM_CALL -> DONE (single-turn, no tools)", async () => {
		const config = makeConfig();
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage("Hi")]);

		// result has user message + assistant message
		expect(result).toHaveLength(2);
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
		expect(result[1].toolCalls).toEqual([]);
	});

	it("S-02: START -> LLM_CALL -> TOOL_EXEC -> LLM_CALL -> DONE (one tool round)", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Let me check.",
					toolCalls: [{ id: "tc1", name: "read_file", arguments: '{"path":"/tmp/x"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Here's the result.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage("Check file")]);

		// Expected: user + assistant(with toolCalls) + tool(result) + assistant(final)
		expect(result).toHaveLength(4);
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
		expect(result[1].toolCalls).toHaveLength(1);
		expect(result[2].role).toBe("tool");
		expect(result[3].role).toBe("assistant");
		expect(result[3].content).toBe("Here's the result.");
	});

	it("S-03: single response with 3 toolCalls", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Running three tools.",
					toolCalls: [
						{ id: "tc1", name: "tool_a", arguments: "{}" },
						{ id: "tc2", name: "tool_b", arguments: "{}" },
						{ id: "tc3", name: "tool_c", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All three done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("tool_a"), makeToolDef("tool_b"), makeToolDef("tool_c")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		// 3 tool messages appended
		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(3);

		// Then one more chatFn call
		expect(chatFn).toHaveBeenCalledTimes(2);
	});

	it("S-04: N rounds of tool loop (parameterized N=1,3,5)", async () => {
		for (const N of [1, 3, 5]) {
			let callIdx = 0;
			const chatFn = vi.fn(async (messages: AgentMessage[]) => {
				callIdx++;
				if (callIdx <= N) {
					return {
						role: "assistant" as const,
						content: `Round ${callIdx}`,
						toolCalls: [{ id: `tc-r${callIdx}`, name: "read_file", arguments: '{"path":"/tmp/x"}' }],
						timestamp: Date.now(),
					};
				}
				return {
					role: "assistant" as const,
					content: "Finished.",
					toolCalls: [],
					timestamp: Date.now(),
				};
			});

			const config = makeConfig({
				chatFn,
				tools: [makeToolDef("read_file")],
				maxIterations: 20,
			});
			const runtime = new AgentRuntime(config);
			await runtime.run([makeUserMessage()]);

			expect(chatFn).toHaveBeenCalledTimes(N + 1);
		}
	});

	it("S-05: compaction mid-loop", async () => {
		let callIdx = 0;
		let compactCalledAt = -1;

		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx <= 2) {
				return {
					role: "assistant" as const,
					content: `Step ${callIdx} - ${"X".repeat(100)}`,
					toolCalls: [{ id: `tc-s5-${callIdx}`, name: "read_file", arguments: '{"path":"/tmp/x"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Final.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const compactFn = vi.fn(async (messages: AgentMessage[]) => {
			compactCalledAt = callIdx;
			return {
				level: 1,
				applied: true,
				tokensFreed: 1000,
				summary: "Mid-loop compacted",
			};
		});

		const config = makeConfig({
			chatFn,
			compactFn,
			compactionConfig: { maxTokens: 5 },
			tools: [makeToolDef("read_file")],
			maxIterations: 20,
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage("A".repeat(100))]);

		expect(compactFn).toHaveBeenCalled();
		// Loop should have continued and finished
		expect(result.some((m) => m.content === "Final.")).toBe(true);
	});

	it("S-06: abort during chatFn call (caught on next iteration)", async () => {
		const controller = new AbortController();

		// First call: returns a response with no toolCalls, but aborts the signal.
		// The abort will be caught on the next iteration's start-of-loop check.
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				// Abort after returning; the no-toolCalls path returns immediately,
				// so we need maxIterations > 1 and a second call to hit the check.
				// Instead, abort and return toolCalls so the abort check hits during tool loop.
				controller.abort();
				return {
					role: "assistant" as const,
					content: "Working...",
					toolCalls: [{ id: "tc-s06", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);

		await expect(runtime.run([makeUserMessage()], { signal: controller.signal })).rejects.toThrow("Aborted");
	});

	it("S-07: tool JSON parse error doesn't stop loop", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Two calls, one bad.",
					toolCalls: [
						{ id: "tc-bad", name: "read_file", arguments: "{invalid" },
						{ id: "tc-good", name: "read_file", arguments: '{"path":"/tmp/ok"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Continued after errors.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(2);

		// First tool message should have parse error content
		// Find the one with toolCallId "tc-bad"
		const badTool = toolMessages.find((m) => m.toolCallId === "tc-bad");
		expect(badTool).toBeDefined();
		expect(badTool!.content).toBeTruthy(); // Error message present

		// Second tool message should have successful result
		const goodTool = toolMessages.find((m) => m.toolCallId === "tc-good");
		expect(goodTool).toBeDefined();

		// Loop continued to final assistant message
		expect(chatFn).toHaveBeenCalledTimes(2);
	});

	it("S-08: unknown tool doesn't stop loop", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Mix of known and unknown.",
					toolCalls: [
						{ id: "tc-unk", name: "nonexistent_tool", arguments: "{}" },
						{ id: "tc-known", name: "read_file", arguments: '{"path":"/tmp/ok"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Continued after unknown tool.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(2);

		const unkTool = toolMessages.find((m) => m.toolCallId === "tc-unk");
		expect(unkTool).toBeDefined();
		expect(unkTool!.content).toContain("Tool not found");

		// Loop continued
		expect(chatFn).toHaveBeenCalledTimes(2);
	});

	it("S-09: chatFn throws stops loop immediately", async () => {
		let throwCount = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			throwCount++;
			throw new Error("Provider error");
		});

		const config = makeConfig({ chatFn });
		const runtime = new AgentRuntime(config);

		await expect(runtime.run([makeUserMessage()])).rejects.toThrow("Provider error");
		expect(throwCount).toBe(1);
		// Only one call; no further iterations
		expect(chatFn).toHaveBeenCalledTimes(1);
	});

	it("S-10: maxIterations reached returns gracefully", async () => {
		const chatFn = vi.fn(async (messages: AgentMessage[]) => ({
			role: "assistant" as const,
			content: "Looping.",
			toolCalls: [{ id: "tc-s10", name: "read_file", arguments: '{"path":"/tmp/x"}' }],
			timestamp: Date.now(),
		}));

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
			maxIterations: 3,
		});
		const runtime = new AgentRuntime(config);

		// Should not throw
		const result = await runtime.run([makeUserMessage()]);

		expect(chatFn).toHaveBeenCalledTimes(3);
		expect(result.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Tool context tests
// ---------------------------------------------------------------------------

describe("AgentRuntime - Tool Context", () => {
	it("T-01: workingDir passed to tool context", async () => {
		const capturedCtx: ToolExecutionContext[] = [];

		const toolDef = {
			name: "read_file",
			description: "Read a file",
			parameters: { type: "object" },
			execute: vi.fn(async (_args: Record<string, unknown>, ctx: ToolExecutionContext) => {
				capturedCtx.push({ ...ctx });
				return "ok";
			}),
		};

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Using tool.",
					toolCalls: [{ id: "tc-t01", name: "read_file", arguments: '{"path":"/tmp/test"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [toolDef],
			workingDir: "/custom/work/dir",
		});
		const runtime = new AgentRuntime(config);
		await runtime.run([makeUserMessage()]);

		expect(capturedCtx).toHaveLength(1);
		expect(capturedCtx[0].workingDir).toBe("/custom/work/dir");
	});

	it("T-02: readOnly passed to tool context", async () => {
		const capturedCtx: ToolExecutionContext[] = [];

		const toolDef = {
			name: "read_file",
			description: "Read a file",
			parameters: { type: "object" },
			execute: vi.fn(async (_args: Record<string, unknown>, ctx: ToolExecutionContext) => {
				capturedCtx.push({ ...ctx });
				return "ok";
			}),
		};

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Using tool.",
					toolCalls: [{ id: "tc-t02", name: "read_file", arguments: '{"path":"/tmp/test"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [toolDef],
			readOnly: true,
		});
		const runtime = new AgentRuntime(config);
		await runtime.run([makeUserMessage()]);

		expect(capturedCtx).toHaveLength(1);
		expect(capturedCtx[0].readOnly).toBe(true);
	});

	it("T-03: sessionId consistent within run", async () => {
		const capturedSessionIds: string[] = [];

		const toolDef = {
			name: "read_file",
			description: "Read a file",
			parameters: { type: "object" },
			execute: vi.fn(async (_args: Record<string, unknown>, ctx: ToolExecutionContext) => {
				capturedSessionIds.push(ctx.sessionId);
				return "ok";
			}),
		};

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx <= 3) {
				return {
					role: "assistant" as const,
					content: `Call ${callIdx}`,
					toolCalls: [{ id: `tc-t03-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [toolDef],
			maxIterations: 20,
		});
		const runtime = new AgentRuntime(config);
		await runtime.run([makeUserMessage()]);

		expect(capturedSessionIds.length).toBeGreaterThanOrEqual(2);
		const first = capturedSessionIds[0];
		for (const sid of capturedSessionIds) {
			expect(sid).toBe(first);
		}
	});

	it("T-04: enqueueReply triggers onReply", async () => {
		const onReplyFn = vi.fn();

		const toolDef = {
			name: "read_file",
			description: "Read a file",
			parameters: { type: "object" },
			execute: vi.fn(async (_args: Record<string, unknown>, ctx: ToolExecutionContext) => {
				ctx.enqueueReply("side message from tool");
				return "tool result";
			}),
		};

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Using tool.",
					toolCalls: [{ id: "tc-t04", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Final.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [toolDef],
		});
		const runtime = new AgentRuntime(config);
		runtime.onReply(onReplyFn);
		await runtime.run([makeUserMessage()]);

		expect(onReplyFn).toHaveBeenCalledWith("side message from tool");
	});
});

// ---------------------------------------------------------------------------
// Message accumulation tests
// ---------------------------------------------------------------------------

describe("AgentRuntime - Message Accumulation", () => {
	it("M-01: message accumulation correctness after N tool rounds", async () => {
		const N = 3;
		const toolCallsPerRound = 2;

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx <= N) {
				const calls: ToolCall[] = [];
				for (let j = 0; j < toolCallsPerRound; j++) {
					calls.push({
						id: `tc-m01-${callIdx}-${j}`,
						name: "read_file",
						arguments: "{}",
					});
				}
				return {
					role: "assistant" as const,
					content: `Round ${callIdx}`,
					toolCalls: calls,
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
			maxIterations: 20,
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		// Formula: 1(user) + N*(1(assistant) + toolCallsPerRound(tool)) + 1(final assistant)
		const expected = 1 + N * (1 + toolCallsPerRound) + 1;
		expect(result).toHaveLength(expected);
	});

	it("M-02: toolCallId matching", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Calling.",
					toolCalls: [
						{ id: "id-alpha", name: "read_file", arguments: "{}" },
						{ id: "id-beta", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [makeToolDef("read_file")],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(2);

		const toolIds = toolMessages.map((m) => m.toolCallId);
		expect(toolIds).toContain("id-alpha");
		expect(toolIds).toContain("id-beta");
	});

	it("M-03: compaction replaces messages correctly", async () => {
		const compactFn = vi.fn(async (messages: AgentMessage[]) => ({
			level: 1,
			applied: true,
			tokensFreed: 5000,
			summary: "System-level compacted summary",
		}));

		const config = makeConfig({
			compactFn,
			compactionConfig: { maxTokens: 1 },
		});
		const runtime = new AgentRuntime(config);

		const result = await runtime.run([makeUserMessage("A very long message".repeat(50))]);

		expect(compactFn).toHaveBeenCalled();

		// After compaction: first message is system summary, last original message preserved
		expect(result[0].role).toBe("system");
		expect(result[0].content).toBe("System-level compacted summary");
	});

	it("M-04: multiple tool calls order preserved", async () => {
		const executionOrder: string[] = [];

		const toolA = {
			name: "tool_a",
			description: "Tool A",
			parameters: { type: "object" },
			execute: vi.fn(async () => {
				executionOrder.push("a");
				return "result-a";
			}),
		};
		const toolB = {
			name: "tool_b",
			description: "Tool B",
			parameters: { type: "object" },
			execute: vi.fn(async () => {
				executionOrder.push("b");
				return "result-b";
			}),
		};
		const toolC = {
			name: "tool_c",
			description: "Tool C",
			parameters: { type: "object" },
			execute: vi.fn(async () => {
				executionOrder.push("c");
				return "result-c";
			}),
		};

		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Three tools.",
					toolCalls: [
						{ id: "tc-a", name: "tool_a", arguments: "{}" },
						{ id: "tc-b", name: "tool_b", arguments: "{}" },
						{ id: "tc-c", name: "tool_c", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const config = makeConfig({
			chatFn,
			tools: [toolA, toolB, toolC],
		});
		const runtime = new AgentRuntime(config);
		const result = await runtime.run([makeUserMessage()]);

		// Tool messages appended in order
		const toolMessages = result.filter((m) => m.role === "tool");
		expect(toolMessages).toHaveLength(3);
		expect(toolMessages[0].toolCallId).toBe("tc-a");
		expect(toolMessages[1].toolCallId).toBe("tc-b");
		expect(toolMessages[2].toolCallId).toBe("tc-c");

		// Tools executed in sequential order
		expect(executionOrder).toEqual(["a", "b", "c"]);
	});
});
