import { describe, it, expect, beforeEach } from "bun:test";
import { ToolRegistry } from "../src/tool-execution.ts";
import type { ToolDefinition, ToolExecutionContext } from "../src/types.ts";

const mockCtx: ToolExecutionContext = {
	sessionId: "test",
	workingDir: "/tmp",
	readOnly: true,
	enqueueReply: () => {},
};

describe("ToolRegistry", () => {
	let registry: ToolRegistry;

	beforeEach(() => {
		registry = new ToolRegistry();
	});

	it("registers and executes a tool", async () => {
		registry.register({
			name: "echo",
			description: "Echoes input",
			parameters: { type: "object", properties: { text: { type: "string" } } },
			execute: async (args) => args.text as string,
		});

		const result = await registry.execute("echo", { text: "hello" }, mockCtx);
		expect(result).toBe("hello");
	});

	it("throws on unknown tool", async () => {
		await expect(registry.execute("nope", {}, mockCtx)).rejects.toThrow("Tool not found: nope");
	});

	it("returns tool definitions for LLM", () => {
		registry.register({
			name: "echo",
			description: "Echoes input",
			parameters: { type: "object", properties: { text: { type: "string" } } },
			execute: async (args) => args.text as string,
		});

		const defs = registry.getDefinitions();
		expect(defs).toHaveLength(1);
		expect(defs[0].name).toBe("echo");
	});

	it("bash tool rejects write commands in readOnly mode", async () => {
		const { BashTool } = await import("../src/tools/bash.ts");
		const bash = new BashTool();
		await expect(bash.execute({ command: "rm -rf /tmp/test" }, { ...mockCtx, readOnly: true })).rejects.toThrow("read-only");
	});

	it("read_file tool reads existing file", async () => {
		const { ReadFileTool } = await import("../src/tools/read-file.ts");
		const tool = new ReadFileTool();
		const content = await tool.execute({ path: "/etc/hostname" }, { ...mockCtx, workingDir: "/" });
		expect(typeof content).toBe("string");
		expect(content.length).toBeGreaterThan(0);
	});

	it("list_files tool returns directory listing", async () => {
		const { ListFilesTool } = await import("../src/tools/list-files.ts");
		const tool = new ListFilesTool();
		const result = await tool.execute({ path: "/tmp" }, { ...mockCtx, workingDir: "/tmp" });
		expect(typeof result).toBe("string");
	});
});
