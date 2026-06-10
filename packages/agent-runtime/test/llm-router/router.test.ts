import { describe, expect, it, vi } from "bun:test";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import { AnthropicProvider } from "../../src/llm-router/providers/anthropic.ts";
import { OpenAIProvider } from "../../src/llm-router/providers/openai.ts";

describe("AnthropicProvider", () => {
	it("converts LLMRequest to Anthropic format and returns LLMResponse", async () => {
		const mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "Hello from Claude" }],
			model: "claude-sonnet-4-20250514",
			usage: { input_tokens: 10, output_tokens: 5 },
		});

		const provider = new AnthropicProvider(
			{ apiKey: "sk-ant-test-key", model: "claude-sonnet-4-20250514", maxTokens: 4096 },
			{ messages: { create: mockCreate } } as any,
		);

		const req: LLMRequest = {
			prompt: "Say hello",
			systemPrompt: "You are helpful",
			maxTokens: 100,
		};

		const res = await provider.chat(req);
		expect(res.text).toBe("Hello from Claude");
		expect(res.model).toBe("claude-sonnet-4-20250514");
		expect(res.usage?.inputTokens).toBe(10);
		expect(res.usage?.outputTokens).toBe(5);
	});

	it("returns embedding vector via mock embed", async () => {
		const mockEmbed = vi.fn().mockResolvedValue({
			data: [{ embedding: new Array(1536).fill(0.1) }],
		});

		const provider = new AnthropicProvider(
			{ apiKey: "sk-ant-test-key", model: "claude-sonnet-4-20250514", maxTokens: 4096 },
			{} as any,
		);
		provider._mockEmbed = mockEmbed;

		const embedding = await provider.embed("test text");
		expect(embedding.length).toBe(1536);
	});
});

describe("OpenAIProvider", () => {
	it("converts LLMRequest to OpenAI format and returns LLMResponse", async () => {
		const mockCreate = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "Hello from GPT" } }],
			model: "gpt-4o",
			usage: { prompt_tokens: 10, completion_tokens: 5 },
		});

		const provider = new OpenAIProvider({ apiKey: "sk-test-key", model: "gpt-4o", maxTokens: 4096 }, {
			chat: { completions: { create: mockCreate } },
		} as any);

		const req: LLMRequest = {
			prompt: "Say hello",
			systemPrompt: "You are helpful",
		};

		const res = await provider.chat(req);
		expect(res.text).toBe("Hello from GPT");
		expect(res.model).toBe("gpt-4o");
		expect(res.usage?.inputTokens).toBe(10);
		expect(res.usage?.outputTokens).toBe(5);
	});

	it("returns embedding via embed endpoint", async () => {
		const mockEmbed = vi.fn().mockResolvedValue({
			data: [{ embedding: new Array(3072).fill(0.05) }],
		});

		const provider = new OpenAIProvider({ apiKey: "sk-test-key", model: "gpt-4o", maxTokens: 4096 }, {
			embeddings: { create: mockEmbed },
		} as any);

		const embedding = await provider.embed("test text", "text-embedding-3-large");
		expect(embedding.length).toBe(3072);
	});
});
