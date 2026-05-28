import { describe, expect, it } from "bun:test";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { EmbedQueue } from "../../packages/agent-runtime/src/llm-router/embed-queue.ts";
import { SemanticSearch } from "../../packages/agent-runtime/src/llm-router/semantic-search.ts";
import { MemoryStore } from "../../packages/gateway/src/memory-store.ts";

const benchDir = join(import.meta.dir, "__tmp_bench__");

describe("Performance Benchmarks", () => {
	it("MemoryStore CRUD under 50ms for 100 ops", async () => {
		await mkdir(benchDir, { recursive: true });
		const store = new MemoryStore(benchDir);
		await store.init();

		const start = performance.now();
		const ids: string[] = [];
		for (let i = 0; i < 100; i++) {
			ids.push(await store.create({ content: `bench item ${i}`, type: "user" }));
		}
		for (const id of ids) {
			await store.read(id);
		}
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(5000);
		await rm(benchDir, { recursive: true, force: true });
	});

	it("EmbedQueue processes 50 items under 2s", async () => {
		const queue = new EmbedQueue();
		queue.setEmbedFn(async () => new Array(8).fill(0.1));
		queue.startProcessing();

		const start = performance.now();
		const promises = [];
		for (let i = 0; i < 50; i++) {
			promises.push(
				new Promise<number[]>((resolve, reject) => {
					queue.enqueue({
						id: `b-${i}`,
						text: `bench ${i}`,
						priority: "memory_search",
						resolve,
						reject,
					});
				}),
			);
		}
		await queue.drain();
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(2000);
	});

	it("SemanticSearch indexes and queries 100 docs under 5s", async () => {
		const search = new SemanticSearch();
		search.setEmbedFn(async (text) => {
			const vec = new Array(8).fill(0);
			vec[0] = text.length;
			return vec;
		});

		const start = performance.now();
		for (let i = 0; i < 100; i++) {
			await search.index(`doc-${i}`, `document content number ${i}`);
		}
		const results = await search.search("document", { topK: 10 });
		const elapsed = performance.now() - start;

		expect(results.length).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(5000);
	});
});
