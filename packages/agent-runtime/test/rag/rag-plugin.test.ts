import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { RAGPlugin } from "../../src/rag/rag-plugin.ts";

const testDir = join(import.meta.dir, "__tmp_rag__");
const docDir = join(testDir, "docs");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
	await mkdir(docDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("RAGPlugin", () => {
	it("indexes documents from a directory", async () => {
		await writeFile(join(docDir, "guide.md"), "This is a guide about TypeScript");
		const plugin = new RAGPlugin({ dataDir: testDir });
		await plugin.indexDocuments({ type: "file", path: docDir, recursive: false, filePatterns: ["*.md"] });
		const result = await plugin.query({ query: "TypeScript", topK: 5 });
		expect(result.chunks.length).toBeGreaterThan(0);
		expect(result.chunks[0].content).toContain("TypeScript");
	});

	it("query returns relevance scores", async () => {
		await writeFile(join(docDir, "a.md"), "Python data science");
		await writeFile(join(docDir, "b.md"), "Rust web assembly");
		const plugin = new RAGPlugin({ dataDir: testDir });
		await plugin.indexDocuments({ type: "file", path: docDir, recursive: false, filePatterns: ["*.md"] });
		const result = await plugin.query({ query: "Python", topK: 2 });
		expect(result.chunks[0].relevanceScore).toBeDefined();
	});

	it("init mutex: concurrent inits share same promise", async () => {
		const plugin = new RAGPlugin({ dataDir: testDir });
		const [r1, r2] = await Promise.all([plugin.initMutex(), plugin.initMutex()]);
		expect(r1).toBe(r2);
	});

	it("query returns empty for no indexed docs", async () => {
		const plugin = new RAGPlugin({ dataDir: testDir });
		const result = await plugin.query({ query: "anything", topK: 5 });
		expect(result.chunks).toEqual([]);
	});

	it("init and destroy lifecycle", async () => {
		const plugin = new RAGPlugin({ dataDir: testDir });
		const mockCtx = {
			logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
			config: {},
			callLLM: async () => ({ text: "ok", model: "test" }),
			scheduleCron: () => {},
		};
		await plugin.init(mockCtx as any);
		await plugin.destroy();
	});
});
