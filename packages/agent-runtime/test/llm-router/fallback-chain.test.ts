import { describe, it, expect, vi } from "bun:test";
import { FallbackChain } from "../../src/llm-router/fallback-chain.ts";
import type { LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";

function makeProvider(name: string, response: string, shouldFail = false) {
	return {
		name,
		chat: vi.fn(async (_req: LLMRequest): Promise<LLMResponse> => {
			if (shouldFail) throw new Error(`${name} failed`);
			return { text: response, model: name };
		}),
		embed: vi.fn(async (_text: string) => new Array(1536).fill(0.1)),
	};
}

describe("FallbackChain", () => {
	it("uses first provider when it succeeds", async () => {
		const primary = makeProvider("primary", "hello");
		const fallback = makeProvider("fallback", "world");
		const chain = new FallbackChain([primary, fallback]);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("hello");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(0);
	});

	it("falls back to second provider when first fails", async () => {
		const primary = makeProvider("primary", "hello", true);
		const fallback = makeProvider("fallback", "world");
		const chain = new FallbackChain([primary, fallback]);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("world");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(1);
	});

	it("throws when all providers fail", async () => {
		const p1 = makeProvider("p1", "", true);
		const p2 = makeProvider("p2", "", true);
		const chain = new FallbackChain([p1, p2]);
		await expect(chain.chat({ prompt: "hi" })).rejects.toThrow("All providers failed");
	});

	it("hot-swaps provider at runtime", async () => {
		const old = makeProvider("old", "old-response");
		const replacement = makeProvider("new", "new-response");
		const chain = new FallbackChain([old]);
		chain.hotSwap("old", replacement);
		const res = await chain.chat({ prompt: "hi" });
		expect(res.text).toBe("new-response");
		expect(old.chat).toHaveBeenCalledTimes(0);
		expect(replacement.chat).toHaveBeenCalledTimes(1);
	});

	it("hot-swap no-op when name not found", () => {
		const old = makeProvider("old", "old-response");
		const chain = new FallbackChain([old]);
		chain.hotSwap("nonexistent", makeProvider("x", "x"));
		expect(chain.providers.length).toBe(1);
	});
});
