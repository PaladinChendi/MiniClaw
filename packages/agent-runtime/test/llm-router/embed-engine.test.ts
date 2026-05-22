import { describe, it, expect, vi } from "bun:test";
import { EmbedEngine } from "../../src/llm-router/embed-engine.ts";

describe("EmbedEngine fallback chain", () => {
	it("uses WASM embed when available", async () => {
		const wasmEmbed = vi.fn(async (_text: string) => new Array(8).fill(0.1));
		const engine = new EmbedEngine({
			wasmEmbedFn: wasmEmbed,
			apiEmbedFn: async () => new Array(8).fill(0.2),
		});
		const result = await engine.embed("hello");
		expect(wasmEmbed).toHaveBeenCalled();
		expect(result).toEqual(new Array(8).fill(0.1));
	});

	it("falls back to API when WASM throws", async () => {
		const apiEmbed = vi.fn(async (_text: string) => new Array(8).fill(0.2));
		const engine = new EmbedEngine({
			wasmEmbedFn: async () => { throw new Error("WASM not available"); },
			apiEmbedFn: apiEmbed,
		});
		const result = await engine.embed("hello");
		expect(apiEmbed).toHaveBeenCalled();
		expect(result).toEqual(new Array(8).fill(0.2));
	});

	it("falls back to hash when both WASM and API fail", async () => {
		const engine = new EmbedEngine({
			wasmEmbedFn: async () => { throw new Error("WASM fail"); },
			apiEmbedFn: async () => { throw new Error("API fail"); },
		});
		const result = await engine.embed("hello");
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
	});

	it("uses hash directly when no providers configured", async () => {
		const engine = new EmbedEngine({});
		const result = await engine.embed("test input");
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
		// Same input = same hash
		const result2 = await engine.embed("test input");
		expect(result).toEqual(result2);
	});

	it("different inputs produce different hashes", async () => {
		const engine = new EmbedEngine({});
		const a = await engine.embed("alpha");
		const b = await engine.embed("beta");
		expect(a).not.toEqual(b);
	});
});
