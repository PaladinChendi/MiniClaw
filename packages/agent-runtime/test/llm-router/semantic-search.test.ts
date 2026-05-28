import { beforeEach, describe, expect, it } from "bun:test";
import { SemanticSearch } from "../../src/llm-router/semantic-search.ts";

describe("SemanticSearch", () => {
	let search: SemanticSearch;

	beforeEach(() => {
		search = new SemanticSearch();
	});

	it("indexes documents and retrieves by similarity", async () => {
		const embedFn = async (text: string) => {
			const vec = new Array(8).fill(0);
			if (text.includes("python")) vec[0] = 1;
			if (text.includes("rust")) vec[1] = 1;
			return vec;
		};
		search.setEmbedFn(embedFn);

		await search.index("doc1", "python programming guide");
		await search.index("doc2", "rust systems programming");

		const results = await search.search("python tutorial", { topK: 2 });
		expect(results.length).toBe(2);
		expect(results[0].id).toBe("doc1");
		expect(results[0].score).toBeGreaterThan(0);
	});

	it("returns empty array when no documents indexed", async () => {
		search.setEmbedFn(async () => new Array(8).fill(0));
		const results = await search.search("anything", { topK: 5 });
		expect(results).toEqual([]);
	});

	it("fallbacks to hash similarity when embed fails", async () => {
		let callCount = 0;
		const embedFn = async () => {
			callCount++;
			if (callCount <= 2) throw new Error("WASM not available");
			return new Array(4).fill(0.5);
		};
		search.setEmbedFn(embedFn);

		await search.index("d1", "hello world");
		const results = await search.search("hello", { topK: 1 });
		expect(results.length).toBe(1);
		expect(results[0].id).toBe("d1");
	});

	it("reranks results with LLM when rerankFn provided", async () => {
		search.setEmbedFn(async (text) => {
			const vec = new Array(4).fill(0);
			vec[0] = text.length;
			return vec;
		});
		search.setRerankFn(async (query, candidates) => {
			return candidates.sort((a, b) => b.text.length - a.text.length);
		});

		await search.index("a", "short");
		await search.index("b", "a much longer document about things");

		const results = await search.search("document", { topK: 2, rerank: true });
		expect(results[0].id).toBe("b");
	});

	it("removes document from index", async () => {
		search.setEmbedFn(async () => new Array(4).fill(0.5));
		await search.index("x", "content");
		await search.index("y", "other content");

		search.removeFromIndex("x");
		const results = await search.search("content", { topK: 5 });
		expect(results.every((r) => r.id !== "x")).toBe(true);
	});
});
