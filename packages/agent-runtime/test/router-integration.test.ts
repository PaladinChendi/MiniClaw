import { describe, expect, it, vi } from "bun:test";
import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import { CircuitBreaker } from "../src/circuit-breaker.ts";
import { FallbackChain } from "../src/llm-router/fallback-chain.ts";
import type { ProviderLike } from "../src/llm-router/fallback-chain.ts";
import { LLMRouter } from "../src/llm-router/index.ts";

// ---------------------------------------------------------------------------
// Helper: create a mock ProviderLike
// ---------------------------------------------------------------------------
function makeProvider(
	name: string,
	response: string,
	shouldFail = false,
): ProviderLike & { chat: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn> } {
	return {
		name,
		chat: vi.fn(async (_req: LLMRequest): Promise<LLMResponse> => {
			if (shouldFail) throw new Error(`${name} failed`);
			return { text: response, model: name };
		}),
		embed: vi.fn(async (_text: string) => new Array(1536).fill(0.1)),
	};
}

// ---------------------------------------------------------------------------
// I-LR-01: Primary provider success
// ---------------------------------------------------------------------------
describe("Router integration: I-LR-01 primary provider success", () => {
	it("returns result from primary and does not call fallback", async () => {
		const primary = makeProvider("primary", "primary-response");
		const fallback = makeProvider("fallback", "fallback-response");
		const chain = new FallbackChain([primary, fallback]);

		const breaker = new CircuitBreaker();

		// Simulate router logic: iterate providers, check breaker, call chat
		const req: LLMRequest = { prompt: "hello" };
		let result: LLMResponse | undefined;
		for (const provider of chain.providers) {
			if (!breaker.allowRequest()) continue;
			try {
				result = await provider.chat(req);
				breaker.recordSuccess();
				break;
			} catch {
				breaker.recordFailure();
			}
		}

		expect(result).toBeDefined();
		expect(result!.text).toBe("primary-response");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(0);
	});
});

// ---------------------------------------------------------------------------
// I-LR-02: Primary fails, fallback succeeds
// ---------------------------------------------------------------------------
describe("Router integration: I-LR-02 primary fails fallback succeeds", () => {
	it("falls back to secondary and records failure on primary breaker", async () => {
		const primary = makeProvider("primary", "", true);
		const fallback = makeProvider("fallback", "fallback-response");
		const chain = new FallbackChain([primary, fallback]);

		const breakers = new Map<string, CircuitBreaker>();
		breakers.set("primary", new CircuitBreaker());
		breakers.set("fallback", new CircuitBreaker());

		const req: LLMRequest = { prompt: "hello" };
		let result: LLMResponse | undefined;
		for (const provider of chain.providers) {
			const breaker = breakers.get(provider.name);
			if (breaker && !breaker.allowRequest()) continue;
			try {
				result = await provider.chat(req);
				breaker?.recordSuccess();
				break;
			} catch {
				breaker?.recordFailure();
			}
		}

		expect(result).toBeDefined();
		expect(result!.text).toBe("fallback-response");
		expect(primary.chat).toHaveBeenCalledTimes(1);
		expect(fallback.chat).toHaveBeenCalledTimes(1);
		// Primary's breaker should have a recorded failure
		expect(breakers.get("primary")!.state).toBe("closed"); // still closed (1 failure < threshold 3)
		// But internal failure count is 1 — verify by pushing 2 more failures
		const primaryBreaker = breakers.get("primary")!;
		primaryBreaker.recordFailure();
		primaryBreaker.recordFailure();
		expect(primaryBreaker.state).toBe("open");
	});
});

// ---------------------------------------------------------------------------
// I-LR-03: All providers fail
// ---------------------------------------------------------------------------
describe("Router integration: I-LR-03 all providers fail", () => {
	it("throws when all providers fail", async () => {
		const p1 = makeProvider("p1", "", true);
		const p2 = makeProvider("p2", "", true);
		const chain = new FallbackChain([p1, p2]);

		const breakers = new Map<string, CircuitBreaker>();
		breakers.set("p1", new CircuitBreaker());
		breakers.set("p2", new CircuitBreaker());

		const req: LLMRequest = { prompt: "hello" };
		let result: LLMResponse | undefined;
		let lastError: Error | undefined;
		for (const provider of chain.providers) {
			const breaker = breakers.get(provider.name);
			if (breaker && !breaker.allowRequest()) continue;
			try {
				result = await provider.chat(req);
				breaker?.recordSuccess();
				break;
			} catch (err) {
				breaker?.recordFailure();
				lastError = err instanceof Error ? err : new Error(String(err));
			}
		}

		expect(result).toBeUndefined();
		expect(lastError).toBeDefined();
		// lastError is from the last provider attempted (p2)
		expect(lastError!.message).toContain("p2 failed");
	});

	it("FallbackChain.chat rejects with 'All providers failed'", async () => {
		const p1 = makeProvider("p1", "", true);
		const p2 = makeProvider("p2", "", true);
		const chain = new FallbackChain([p1, p2]);

		await expect(chain.chat({ prompt: "hello" })).rejects.toThrow("All providers failed");
	});
});

// ---------------------------------------------------------------------------
// I-LR-04: hotSwap replaces provider
// ---------------------------------------------------------------------------
describe("Router integration: I-LR-04 hotSwap replaces provider", () => {
	it("new provider is called after hotSwap", async () => {
		const oldPrimary = makeProvider("primary", "old-response");
		const fallback = makeProvider("fallback", "fallback-response");
		const chain = new FallbackChain([oldPrimary, fallback]);

		// First request uses old primary
		const res1 = await chain.chat({ prompt: "hello" });
		expect(res1.text).toBe("old-response");
		expect(oldPrimary.chat).toHaveBeenCalledTimes(1);

		// hotSwap primary
		const newPrimary = makeProvider("primary", "new-response");
		chain.hotSwap("primary", newPrimary);

		// Second request should use new primary
		const res2 = await chain.chat({ prompt: "hello" });
		expect(res2.text).toBe("new-response");
		expect(newPrimary.chat).toHaveBeenCalledTimes(1);
		// old primary is no longer in the chain, so still only 1 call total
		expect(oldPrimary.chat).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// I-LR-05: Open circuit breaker is skipped
// ---------------------------------------------------------------------------
describe("Router integration: I-LR-05 open circuit breaker skipped", () => {
	it("skips provider with open breaker and uses fallback directly", async () => {
		const primary = makeProvider("primary", "primary-response");
		const fallback = makeProvider("fallback", "fallback-response");
		const chain = new FallbackChain([primary, fallback]);

		// Manually open primary's circuit breaker
		const primaryBreaker = new CircuitBreaker();
		primaryBreaker.recordFailure();
		primaryBreaker.recordFailure();
		primaryBreaker.recordFailure();
		expect(primaryBreaker.state).toBe("open");
		expect(primaryBreaker.allowRequest()).toBe(false);

		const fallbackBreaker = new CircuitBreaker();

		const breakers = new Map<string, CircuitBreaker>();
		breakers.set("primary", primaryBreaker);
		breakers.set("fallback", fallbackBreaker);

		const req: LLMRequest = { prompt: "hello" };
		let result: LLMResponse | undefined;
		for (const provider of chain.providers) {
			const breaker = breakers.get(provider.name);
			if (breaker && !breaker.allowRequest()) continue;
			try {
				result = await provider.chat(req);
				breaker?.recordSuccess();
				break;
			} catch {
				breaker?.recordFailure();
			}
		}

		expect(result).toBeDefined();
		expect(result!.text).toBe("fallback-response");
		// primary.chat should NOT have been called because breaker was open
		expect(primary.chat).toHaveBeenCalledTimes(0);
		expect(fallback.chat).toHaveBeenCalledTimes(1);
	});
});
