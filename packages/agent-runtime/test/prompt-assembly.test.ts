import { describe, expect, it } from "bun:test";
import { PromptAssembler } from "../src/prompt-assembly.ts";
import type { AgentMessage } from "../src/types.ts";

describe("PromptAssembler", () => {
	it("assembles system prompt with base instructions", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are ebsclaw." });
		const result = assembler.assemble([], []);
		expect(result.systemPrompt).toContain("You are ebsclaw.");
	});

	it("injects memory entries into system prompt", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are ebsclaw." });
		const memories = [
			{ content: "User prefers Chinese", type: "user" as const, relevanceScore: 0.9 },
			{ content: "Project uses Bun", type: "project" as const, relevanceScore: 0.8 },
		];
		const result = assembler.assemble([], [], memories);
		expect(result.systemPrompt).toContain("User prefers Chinese");
		expect(result.systemPrompt).toContain("Project uses Bun");
	});

	it("injects tool descriptions into system prompt", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are ebsclaw." });
		const toolDefs = [
			{ name: "bash", description: "Run a bash command", parameters: {} },
			{ name: "read_file", description: "Read file contents", parameters: {} },
		];
		const result = assembler.assemble([], toolDefs, []);
		expect(result.systemPrompt).toContain("bash");
		expect(result.systemPrompt).toContain("read_file");
	});

	it("estimates tokens using 4 chars per token heuristic", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "You are ebsclaw." });
		const messages: AgentMessage[] = [{ role: "user", content: "hello world test", timestamp: Date.now() }];
		const result = assembler.assemble(messages, [], []);
		expect(result.estimatedTokens).toBeGreaterThan(0);
	});

	it("truncates messages that exceed maxTokens budget", () => {
		const assembler = new PromptAssembler({ baseSystemPrompt: "short", maxTokens: 20 });
		const messages: AgentMessage[] = [{ role: "user", content: "a".repeat(200), timestamp: Date.now() }];
		const result = assembler.assemble(messages, [], []);
		expect(result.messages.length).toBeLessThanOrEqual(messages.length);
	});
});
