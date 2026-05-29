import { describe, expect, it, vi } from "bun:test";
import { AgentRuntime } from "../../packages/agent-runtime/src/agent-runtime.ts";
import type {
	AgentMessage,
	CompactionResult,
	ToolCall,
	ToolExecutionContext,
	ToolResult,
} from "../../packages/agent-runtime/src/types.ts";

// ── Helpers ──

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
		maxIterations: 20,
		workingDir: "/tmp",
		readOnly: false,
		...overrides,
	};
}

function makeUserMsg(content = "Hello!"): AgentMessage {
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

// ────────────────────────────────────────────────────────────────
// 一、串行工具链（Sequential Chain）
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Sequential Chain", () => {
	it("MT-01: 3-step serial chain (read_file → bash → read_file)", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Reading file.",
					toolCalls: [{ id: "tc1", name: "read_file", arguments: '{"path":"/tmp/a"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Running command.",
					toolCalls: [{ id: "tc2", name: "bash", arguments: '{"command":"ls"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Reading again.",
					toolCalls: [{ id: "tc3", name: "read_file", arguments: '{"path":"/tmp/b"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All 3 steps done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("read_file"), makeToolDef("bash")],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(result[result.length - 1].content).toBe("All 3 steps done.");
	});

	it("MT-02: dependency chain — list_files result feeds into read_file", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async (messages: AgentMessage[]) => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Listing files.",
					toolCalls: [{ id: "tc-ls", name: "list_files", arguments: '{"path":"/tmp"}' }],
					timestamp: Date.now(),
				};
			}
			// Verify the tool result from previous round is in context
			if (callIdx === 2) {
				const toolMsg = messages.find((m) => m.role === "tool");
				expect(toolMsg).toBeDefined();
				expect(toolMsg!.content).toContain("found.txt");
				return {
					role: "assistant" as const,
					content: "Reading found file.",
					toolCalls: [{ id: "tc-read", name: "read_file", arguments: '{"path":"/tmp/found.txt"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Processing with bash.",
					toolCalls: [{ id: "tc-bash", name: "bash", arguments: '{"command":"wc -l /tmp/found.txt"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Dependency chain complete.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					{
						name: "list_files",
						description: "List files",
						parameters: { type: "object" },
						execute: async () => "found.txt\nother.txt",
					},
					makeToolDef("read_file"),
					makeToolDef("bash"),
				],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		expect(result[result.length - 1].content).toBe("Dependency chain complete.");
	});

	it("MT-03: retry pattern — first call wrong path, second call correct", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Trying path.",
					toolCalls: [{ id: "tc-r1", name: "read_file", arguments: '{"path":"/nonexistent"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Retrying correct path.",
					toolCalls: [{ id: "tc-r2", name: "read_file", arguments: '{"path":"/tmp/correct.txt"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Retry succeeded.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const readExecute = vi.fn(async (args: Record<string, unknown>) => {
			if (args.path === "/nonexistent") throw new Error("ENOENT: no such file");
			return "correct file contents";
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [{ name: "read_file", description: "Read", parameters: { type: "object" }, execute: readExecute }],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		expect(readExecute).toHaveBeenCalledTimes(2);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(2);
		// First tool result should be error
		expect(toolMsgs[0].content).toContain("ENOENT");
		// Second tool result should be success
		expect(toolMsgs[1].content).toContain("correct file contents");
		expect(result[result.length - 1].content).toBe("Retry succeeded.");
	});

	it("MT-04: read-modify-read pattern", async () => {
		let callIdx = 0;
		let fileContent = "original content";

		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Reading original.",
					toolCalls: [{ id: "tc-r1", name: "read_file", arguments: '{"path":"/tmp/data.txt"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Modifying file.",
					toolCalls: [{ id: "tc-bash", name: "bash", arguments: '{"command":"echo modified > /tmp/data.txt"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Verifying change.",
					toolCalls: [{ id: "tc-r2", name: "read_file", arguments: '{"path":"/tmp/data.txt"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Verified: file was modified.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const bashExecute = vi.fn(async () => {
			fileContent = "modified";
			return "modification done";
		});
		const readExecute = vi.fn(async () => fileContent);

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					{ name: "read_file", description: "Read", parameters: { type: "object" }, execute: readExecute },
					{ name: "bash", description: "Bash", parameters: { type: "object" }, execute: bashExecute },
				],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		// read_file called twice
		expect(readExecute).toHaveBeenCalledTimes(2);
		// Second read returns modified content (async mock returns Promise)
		const secondResult = await readExecute.mock.results[1].value;
		expect(secondResult).toBe("modified");
	});
});

// ────────────────────────────────────────────────────────────────
// 二、并行工具调用（Parallel within Single Response）
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Parallel Calls", () => {
	it("MT-05: 3 parallel tools in single response", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Running 3 tools at once.",
					toolCalls: [
						{ id: "tc-a", name: "read_file", arguments: '{"path":"/tmp/a"}' },
						{ id: "tc-b", name: "bash", arguments: '{"command":"ls"}' },
						{ id: "tc-c", name: "list_files", arguments: '{"path":"/tmp"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All 3 done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const onToolCallFn = vi.fn();
		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("read_file"), makeToolDef("bash"), makeToolDef("list_files")],
			}),
		);
		runtime.onToolCall(onToolCallFn);
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(onToolCallFn).toHaveBeenCalledTimes(3);
		expect(chatFn).toHaveBeenCalledTimes(2);
	});

	it("MT-06: same tool multiple instances in parallel", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Reading 3 files.",
					toolCalls: [
						{ id: "tc-f1", name: "read_file", arguments: '{"path":"/tmp/1.txt"}' },
						{ id: "tc-f2", name: "read_file", arguments: '{"path":"/tmp/2.txt"}' },
						{ id: "tc-f3", name: "read_file", arguments: '{"path":"/tmp/3.txt"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All files read.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(toolMsgs[0].toolCallId).toBe("tc-f1");
		expect(toolMsgs[1].toolCallId).toBe("tc-f2");
		expect(toolMsgs[2].toolCallId).toBe("tc-f3");
	});

	it("MT-07: parallel then serial", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Gathering info.",
					toolCalls: [
						{ id: "tc-p1", name: "read_file", arguments: '{"path":"/tmp/a"}' },
						{ id: "tc-p2", name: "read_file", arguments: '{"path":"/tmp/b"}' },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Processing.",
					toolCalls: [{ id: "tc-s1", name: "bash", arguments: '{"command":"diff"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Parallel+serial done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file"), makeToolDef("bash")] }));
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(3);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(result[result.length - 1].content).toBe("Parallel+serial done.");
	});
});

// ────────────────────────────────────────────────────────────────
// 三、混合串行/并行
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Mixed Serial/Parallel", () => {
	it("MT-08: progressive parallelism (1 → 2 → 3 tools)", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Step 1.",
					toolCalls: [{ id: "tc-1", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Step 2.",
					toolCalls: [
						{ id: "tc-2a", name: "read_file", arguments: "{}" },
						{ id: "tc-2b", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Step 3.",
					toolCalls: [
						{ id: "tc-3a", name: "read_file", arguments: "{}" },
						{ id: "tc-3b", name: "read_file", arguments: "{}" },
						{ id: "tc-3c", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Progressive done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		const result = await runtime.run([makeUserMsg()]);

		// 1(user) + 3(assistant) + (1+2+3)(tool) + 1(final assistant) = 11
		expect(result).toHaveLength(11);
	});

	it("MT-09: parallel gather then serial process", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Gathering.",
					toolCalls: [
						{ id: "tc-g1", name: "read_file", arguments: '{"path":"/tmp/a"}' },
						{ id: "tc-g2", name: "read_file", arguments: '{"path":"/tmp/b"}' },
						{ id: "tc-g3", name: "read_file", arguments: '{"path":"/tmp/c"}' },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Analyzing.",
					toolCalls: [{ id: "tc-s1", name: "bash", arguments: '{"command":"analyze"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Summarizing.",
					toolCalls: [{ id: "tc-s2", name: "bash", arguments: '{"command":"summarize"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Gather-process done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file"), makeToolDef("bash")] }));
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(5); // 3 + 1 + 1
	});

	it("MT-10: alternating 1→3→1→2 tools", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Round 1.",
					toolCalls: [{ id: "tc-1", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Round 2.",
					toolCalls: [
						{ id: "tc-2a", name: "read_file", arguments: "{}" },
						{ id: "tc-2b", name: "read_file", arguments: "{}" },
						{ id: "tc-2c", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Round 3.",
					toolCalls: [{ id: "tc-3", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 4) {
				return {
					role: "assistant" as const,
					content: "Round 4.",
					toolCalls: [
						{ id: "tc-4a", name: "read_file", arguments: "{}" },
						{ id: "tc-4b", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Alternating done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(5);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(7); // 1 + 3 + 1 + 2
	});
});

// ────────────────────────────────────────────────────────────────
// 四、错误恢复与容错
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Error Recovery", () => {
	it("MT-11: partial failure in parallel calls", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Trying 3 tools.",
					toolCalls: [
						{ id: "tc-ok1", name: "read_file", arguments: '{"path":"/tmp/ok1"}' },
						{ id: "tc-fail", name: "bash", arguments: '{"command":"bad"}' },
						{ id: "tc-ok2", name: "list_files", arguments: '{"path":"/tmp/ok2"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Partial failure handled.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const bashExecute = vi.fn(async () => {
			throw new Error("Command failed: bad");
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					makeToolDef("read_file"),
					{ name: "bash", description: "Bash", parameters: { type: "object" }, execute: bashExecute },
					makeToolDef("list_files"),
				],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(toolMsgs[0].toolCallId).toBe("tc-ok1");
		expect(toolMsgs[1].content).toContain("Command failed");
		expect(toolMsgs[2].toolCallId).toBe("tc-ok2");
		expect(result[result.length - 1].content).toBe("Partial failure handled.");
	});

	it("MT-12: mixed JSON parse error with valid call", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Mixed JSON.",
					toolCalls: [
						{ id: "tc-badjson", name: "read_file", arguments: "{not valid json" },
						{ id: "tc-goodjson", name: "read_file", arguments: '{"path":"/tmp/ok"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "JSON mix handled.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(2);
		expect(toolMsgs[0].toolCallId).toBe("tc-badjson");
		expect(toolMsgs[0].content).toBeTruthy(); // Error message from JSON.parse
		expect(toolMsgs[1].toolCallId).toBe("tc-goodjson");
		expect(chatFn).toHaveBeenCalledTimes(2);
	});

	it("MT-13: unknown tool mixed with known tool", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Mixed tools.",
					toolCalls: [
						{ id: "tc-unk", name: "nonexistent_tool", arguments: "{}" },
						{ id: "tc-known", name: "read_file", arguments: '{"path":"/tmp/ok"}' },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Unknown+known handled.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(2);
		expect(toolMsgs[0].content).toContain("Tool not found");
		expect(toolMsgs[1].content).toContain("read_file result");
	});

	it("MT-14: two consecutive failures then recovery", async () => {
		let callIdx = 0;
		const bashExecute = vi.fn(async () => {
			throw new Error("Disk full");
		});
		const readExecute = vi.fn(async (args: Record<string, unknown>) => {
			if (args.path === "/tmp/fail") throw new Error("Access denied");
			return "success content";
		});

		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Try bash.",
					toolCalls: [{ id: "tc-f1", name: "bash", arguments: '{"command":"x"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Try read fail.",
					toolCalls: [{ id: "tc-f2", name: "read_file", arguments: '{"path":"/tmp/fail"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Try read success.",
					toolCalls: [{ id: "tc-s1", name: "read_file", arguments: '{"path":"/tmp/ok"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Recovered after 2 failures.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					{ name: "bash", description: "Bash", parameters: { type: "object" }, execute: bashExecute },
					{ name: "read_file", description: "Read", parameters: { type: "object" }, execute: readExecute },
				],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		expect(toolMsgs[0].content).toContain("Disk full");
		expect(toolMsgs[1].content).toContain("Access denied");
		expect(toolMsgs[2].content).toContain("success content");
	});

	it("MT-15: all parallel tools fail", async () => {
		let callIdx = 0;
		const failingExecute = vi.fn(async () => {
			throw new Error("Service unavailable");
		});

		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Trying 3 tools.",
					toolCalls: [
						{ id: "tc-e1", name: "tool_a", arguments: "{}" },
						{ id: "tc-e2", name: "tool_b", arguments: "{}" },
						{ id: "tc-e3", name: "tool_c", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All failed but loop continued.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [
					{ name: "tool_a", description: "A", parameters: { type: "object" }, execute: failingExecute },
					{ name: "tool_b", description: "B", parameters: { type: "object" }, execute: failingExecute },
					{ name: "tool_c", description: "C", parameters: { type: "object" }, execute: failingExecute },
				],
			}),
		);
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(3);
		for (const tm of toolMsgs) {
			expect(tm.content).toContain("Service unavailable");
		}
		expect(chatFn).toHaveBeenCalledTimes(2);
		expect(result[result.length - 1].content).toBe("All failed but loop continued.");
	});
});

// ────────────────────────────────────────────────────────────────
// 五、Compaction 与长上下文
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Compaction in Multi-Tool Loops", () => {
	it("MT-16: compaction triggers during multi-tool loop", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx <= 5) {
				return {
					role: "assistant" as const,
					content: `Step ${callIdx} - ${"Y".repeat(200)}`,
					toolCalls: [{ id: `tc-c16-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Compaction loop done.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const compactFn = vi.fn(async () => ({
			level: 2,
			applied: true,
			tokensFreed: 10000,
			summary: "Compacted during multi-tool loop",
		}));

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				compactFn,
				compactionConfig: { maxTokens: 5 },
				tools: [makeToolDef("read_file")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Start".repeat(100))]);

		expect(compactFn).toHaveBeenCalled();
		expect(result.some((m) => m.role === "assistant")).toBe(true);
	});

	it("MT-17: compaction applied then loop continues with more tools", async () => {
		let callIdx = 0;
		let compactCallCount = 0;

		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx <= 2) {
				return {
					role: "assistant" as const,
					content: `Pre-compact step ${callIdx} - ${"Z".repeat(200)}`,
					toolCalls: [{ id: `tc-pre-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			if (callIdx <= 5) {
				return {
					role: "assistant" as const,
					content: `Post-compact step ${callIdx}`,
					toolCalls: [{ id: `tc-post-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Compaction didn't break loop.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const compactFn = vi.fn(async () => {
			compactCallCount++;
			return {
				level: 1,
				applied: true,
				tokensFreed: 5000,
				summary: "Mid-loop compacted",
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				compactFn,
				compactionConfig: { maxTokens: 5 },
				tools: [makeToolDef("read_file")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Big".repeat(100))]);

		expect(compactFn).toHaveBeenCalled();
		expect(result[result.length - 1].content).toBe("Compaction didn't break loop.");
	});

	it("MT-18: compactFn returns applied=false in multi-tool loop", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx <= 3) {
				return {
					role: "assistant" as const,
					content: `Round ${callIdx} - ${"W".repeat(200)}`,
					toolCalls: [{ id: `tc-c18-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Loop continued despite applied=false.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const compactFn = vi.fn(async () => ({
			level: 1,
			applied: false,
			tokensFreed: 0,
		}));

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				compactFn,
				compactionConfig: { maxTokens: 5 },
				tools: [makeToolDef("read_file")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Large".repeat(100))]);

		expect(compactFn).toHaveBeenCalled();
		// Original messages preserved (not replaced by summary)
		expect(result.some((m) => m.content.includes("Round"))).toBe(true);
	});
});

// ────────────────────────────────────────────────────────────────
// 六、中断与边界
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Interruption & Boundaries", () => {
	it("MT-19: AbortSignal during parallel tool execution", async () => {
		const controller = new AbortController();

		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				// Abort right after returning — the check hits during the tool loop
				controller.abort();
				return {
					role: "assistant" as const,
					content: "Working.",
					toolCalls: [
						{ id: "tc-ab1", name: "read_file", arguments: "{}" },
						{ id: "tc-ab2", name: "read_file", arguments: "{}" },
						{ id: "tc-ab3", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Should not reach.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		await expect(runtime.run([makeUserMsg()], { signal: controller.signal })).rejects.toThrow("Aborted");
	});

	it("MT-20: maxIterations with 2 tools per round", async () => {
		const chatFn = vi.fn(async () => ({
			role: "assistant" as const,
			content: "Looping with 2 tools.",
			toolCalls: [
				{ id: "tc-a", name: "read_file", arguments: "{}" },
				{ id: "tc-b", name: "read_file", arguments: "{}" },
			],
			timestamp: Date.now(),
		}));

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")], maxIterations: 3 }));
		const result = await runtime.run([makeUserMsg()]);

		expect(chatFn).toHaveBeenCalledTimes(3);
		// 1(user) + 3*(1 assistant + 2 tool) = 10
		expect(result).toHaveLength(10);
	});

	it("MT-21: maxIterations reached exactly after final tool round", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx <= 2) {
				return {
					role: "assistant" as const,
					content: `Tool round ${callIdx}.`,
					toolCalls: [{ id: `tc-exact-${callIdx}`, name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Finished cleanly.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")], maxIterations: 3 }));
		const result = await runtime.run([makeUserMsg()]);

		// 3 iterations: 2 tool rounds + 1 final = chatFn called 3 times
		expect(chatFn).toHaveBeenCalledTimes(3);
		expect(result[result.length - 1].content).toBe("Finished cleanly.");
	});
});

// ────────────────────────────────────────────────────────────────
// 七、回调与消息验证
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Callbacks & Message Verification", () => {
	it("MT-22: onReply call sequence in multi-tool loop", async () => {
		const replyContents: string[] = [];
		const onReplyFn = vi.fn((text: string) => {
			replyContents.push(text);
		});

		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx <= 3) {
				return {
					role: "assistant" as const,
					content: `Assistant round ${callIdx}`,
					toolCalls: [{ id: `tc-cb-${callIdx}`, name: "read_file", arguments: "{}" }],
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

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		runtime.onReply(onReplyFn);
		await runtime.run([makeUserMsg()]);

		expect(onReplyFn).toHaveBeenCalledTimes(4);
		expect(replyContents).toEqual(["Assistant round 1", "Assistant round 2", "Assistant round 3", "Final answer."]);
	});

	it("MT-23: onToolCall for parallel calls", async () => {
		const toolCallLog: Array<{ name: string; toolCallId: string }> = [];
		const onToolCallFn = vi.fn((call: ToolCall, result: ToolResult) => {
			toolCallLog.push({ name: call.name, toolCallId: result.toolCallId });
		});

		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Parallel.",
					toolCalls: [
						{ id: "tc-pa", name: "read_file", arguments: "{}" },
						{ id: "tc-pb", name: "bash", arguments: "{}" },
						{ id: "tc-pc", name: "list_files", arguments: "{}" },
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

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("read_file"), makeToolDef("bash"), makeToolDef("list_files")],
			}),
		);
		runtime.onToolCall(onToolCallFn);
		await runtime.run([makeUserMsg()]);

		expect(onToolCallFn).toHaveBeenCalledTimes(3);
		expect(toolCallLog.map((l) => l.name)).toEqual(["read_file", "bash", "list_files"]);
		expect(toolCallLog.map((l) => l.toolCallId)).toEqual(["tc-pa", "tc-pb", "tc-pc"]);
	});

	it("MT-24: toolCallId strict matching across 2 rounds of 2 tools", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Round 1.",
					toolCalls: [
						{ id: "id-r1a", name: "read_file", arguments: "{}" },
						{ id: "id-r1b", name: "bash", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Round 2.",
					toolCalls: [
						{ id: "id-r2a", name: "read_file", arguments: "{}" },
						{ id: "id-r2b", name: "bash", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All matched.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file"), makeToolDef("bash")] }));
		const result = await runtime.run([makeUserMsg()]);

		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(4);
		const ids = toolMsgs.map((m) => m.toolCallId);
		expect(ids).toEqual(["id-r1a", "id-r1b", "id-r2a", "id-r2b"]);

		// Verify each assistant message has matching toolCall ids
		const assistantMsgs = result.filter((m) => m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0);
		expect(assistantMsgs[0].toolCalls!.map((tc) => tc.id)).toEqual(["id-r1a", "id-r1b"]);
		expect(assistantMsgs[1].toolCalls!.map((tc) => tc.id)).toEqual(["id-r2a", "id-r2b"]);
	});

	it("MT-25: streaming chunk sequence in multi-tool loop", async () => {
		const rawChunks: Array<{ type: string; content: string }> = [];
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "First tool call.",
					toolCalls: [
						{ id: "tc-s1", name: "read_file", arguments: "{}" },
						{ id: "tc-s2", name: "read_file", arguments: "{}" },
						{ id: "tc-s3", name: "read_file", arguments: "{}" },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Second tool call.",
					toolCalls: [{ id: "tc-s4", name: "read_file", arguments: "{}" }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "All streamed.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(makeConfig({ chatFn, tools: [makeToolDef("read_file")] }));
		// Use onRawChunk to capture all chunk types including tool_call/tool_result/done
		runtime.streamingEngine.onRawChunk((chunk) => {
			rawChunks.push({ type: chunk.type, content: chunk.content });
		});
		await runtime.run([makeUserMsg()]);

		// Expected chunk sequence (tools execute sequentially: call→result→call→result...):
		// Round 1: text, tool_call, tool_result, tool_call, tool_result, tool_call, tool_result
		// Round 2: text, tool_call, tool_result
		// Round 3: text, done (from early return) + done (from streamingEngine.end())
		const types = rawChunks.map((c) => c.type);
		expect(types).toEqual([
			"text",
			"tool_call",
			"tool_result",
			"tool_call",
			"tool_result",
			"tool_call",
			"tool_result",
			"text",
			"tool_call",
			"tool_result",
			"text",
			"done",
			"done",
		]);
	});
});

// ────────────────────────────────────────────────────────────────
// 八、真实 Agent 行为模式
// ────────────────────────────────────────────────────────────────

describe("Multi-Tool E2E — Real Agent Behavior Patterns", () => {
	it("MT-26: search-locate-read pattern", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Searching root.",
					toolCalls: [{ id: "tc-ls1", name: "list_files", arguments: '{"path":"/project"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Found src dir, listing subdirs.",
					toolCalls: [
						{ id: "tc-ls2a", name: "list_files", arguments: '{"path":"/project/src/models"}' },
						{ id: "tc-ls2b", name: "list_files", arguments: '{"path":"/project/src/utils"}' },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Found target file.",
					toolCalls: [{ id: "tc-read1", name: "read_file", arguments: '{"path":"/project/src/models/user.ts"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Found the file containing the User model.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("list_files"), makeToolDef("read_file")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Find the User model")]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(4); // 1 + 2 + 1
		expect(result[result.length - 1].content).toContain("User model");
	});

	it("MT-27: debug-fix-verify pattern", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Reading source.",
					toolCalls: [{ id: "tc-src", name: "read_file", arguments: '{"path":"/src/main.ts"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Running tests.",
					toolCalls: [{ id: "tc-test1", name: "bash", arguments: '{"command":"npm test"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Test failed, reading error source.",
					toolCalls: [{ id: "tc-err", name: "read_file", arguments: '{"path":"/src/utils.ts"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 4) {
				return {
					role: "assistant" as const,
					content: "Applying fix.",
					toolCalls: [{ id: "tc-fix", name: "bash", arguments: '{"command":"sed -i fix /src/utils.ts"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 5) {
				return {
					role: "assistant" as const,
					content: "Re-running tests.",
					toolCalls: [{ id: "tc-test2", name: "bash", arguments: '{"command":"npm test"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Bug fixed, tests passing.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("read_file"), makeToolDef("bash")],
				maxIterations: 10,
			}),
		);
		const result = await runtime.run([makeUserMsg("Fix the failing test")]);

		expect(chatFn).toHaveBeenCalledTimes(6);
		expect(result[result.length - 1].content).toContain("Bug fixed");
	});

	it("MT-28: code review pattern — parallel reads then serial diff", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Reading 3 files in parallel.",
					toolCalls: [
						{ id: "tc-rA", name: "read_file", arguments: '{"path":"/src/a.ts"}' },
						{ id: "tc-rB", name: "read_file", arguments: '{"path":"/src/b.ts"}' },
						{ id: "tc-rC", name: "read_file", arguments: '{"path":"/src/c.ts"}' },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Running diff.",
					toolCalls: [{ id: "tc-diff", name: "bash", arguments: '{"command":"git diff"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Review: 2 issues found in a.ts and c.ts.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("read_file"), makeToolDef("bash")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Review this PR")]);

		expect(chatFn).toHaveBeenCalledTimes(3);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(4); // 3 reads + 1 diff
	});

	it("MT-29: recursive exploration — list then parallel list then read", async () => {
		let callIdx = 0;
		const chatFn = vi.fn(async () => {
			callIdx++;
			if (callIdx === 1) {
				return {
					role: "assistant" as const,
					content: "Listing root.",
					toolCalls: [{ id: "tc-root", name: "list_files", arguments: '{"path":"/"}' }],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 2) {
				return {
					role: "assistant" as const,
					content: "Exploring 2 subdirs in parallel.",
					toolCalls: [
						{ id: "tc-dir1", name: "list_files", arguments: '{"path":"/src"}' },
						{ id: "tc-dir2", name: "list_files", arguments: '{"path":"/lib"}' },
					],
					timestamp: Date.now(),
				};
			}
			if (callIdx === 3) {
				return {
					role: "assistant" as const,
					content: "Reading discovered target.",
					toolCalls: [{ id: "tc-target", name: "read_file", arguments: '{"path":"/lib/config.ts"}' }],
					timestamp: Date.now(),
				};
			}
			return {
				role: "assistant" as const,
				content: "Found config at /lib/config.ts with database settings.",
				toolCalls: [],
				timestamp: Date.now(),
			};
		});

		const runtime = new AgentRuntime(
			makeConfig({
				chatFn,
				tools: [makeToolDef("list_files"), makeToolDef("read_file")],
			}),
		);
		const result = await runtime.run([makeUserMsg("Find the database config")]);

		expect(chatFn).toHaveBeenCalledTimes(4);
		const toolMsgs = result.filter((m) => m.role === "tool");
		expect(toolMsgs).toHaveLength(4); // 1 + 2 + 1
		expect(result[result.length - 1].content).toContain("database settings");
	});
});
