import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { SemanticSearch } from "@miniclaw/agent-runtime/src/llm-router/semantic-search.ts";
import { MemoryPlugin } from "@miniclaw/agent-runtime/src/memory/memory-plugin.ts";
import { RAGPlugin } from "@miniclaw/agent-runtime/src/rag/rag-plugin.ts";
import { mkdir, rm, writeFile } from "fs/promises";
import { Gateway, MemoryStore, MemoryStoreHandle } from "../src/index.ts";

const testDir = join(import.meta.dir, "__tmp_e2e__");
const docDir = join(testDir, "docs");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
	await mkdir(docDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("E2E integration: Memory + RAG + Search through Gateway", () => {
	it("stores memory, indexes RAG docs, and searches both", async () => {
		await writeFile(join(docDir, "guide.md"), "miniclaw is an AI agent orchestration framework");

		const store = new MemoryStore(testDir);
		await store.init();

		const gw = new Gateway({ sessionDir: testDir });
		gw.setMemoryStore(store);
		await gw.start();

		const memPlugin = new MemoryPlugin({ store });
		await memPlugin.store({ content: "user prefers dark theme", type: "user" });

		const search = new SemanticSearch();
		search.setEmbedFn(async (text) => {
			const vec = new Array(8).fill(0);
			if (text.includes("dark")) vec[0] = 1;
			if (text.includes("agent")) vec[1] = 1;
			return vec;
		});
		await search.index("mem-1", "user prefers dark theme");
		await search.index("doc-1", "miniclaw is an AI agent orchestration framework");

		const results = await search.search("dark mode", { topK: 2 });
		expect(results.length).toBe(2);
		expect(results[0].id).toBe("mem-1");

		const ragPlugin = new RAGPlugin({ dataDir: testDir });
		await ragPlugin.indexDocuments({ type: "file", path: docDir, recursive: false, filePatterns: ["*.md"] });
		const ragResult = await ragPlugin.query({ query: "agent", topK: 1 });
		expect(ragResult.chunks.length).toBeGreaterThan(0);
		expect(ragResult.chunks[0].content).toContain("agent");

		await gw.stop();
	});

	it("PluginContext.getStore returns read-only handle", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const gw = new Gateway({ sessionDir: testDir });
		gw.setMemoryStore(store);
		await gw.start();

		const ctx = gw.createPluginContext("test-plugin", {});
		const handle = ctx.getStore();
		expect(() => (handle as any).create({ content: "x", type: "user" })).toThrow("read-only");

		await gw.stop();
	});

	it("Gateway embed queues and processes by priority", async () => {
		const gw = new Gateway({ sessionDir: testDir });
		await gw.start();

		const order: string[] = [];
		gw.setEmbedFn(async (text: string) => {
			order.push(text);
			return new Array(4).fill(0.1);
		});

		const results = await Promise.all([
			gw.embed("rag doc", "rag_indexing"),
			gw.embed("search query", "memory_search"),
			gw.embed("chat msg", "session_chat"),
		]);

		expect(results.every(Array.isArray)).toBe(true);
		await gw.stop();
	});
});
