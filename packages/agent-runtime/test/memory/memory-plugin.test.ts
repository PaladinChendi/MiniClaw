import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import { mkdir, rm } from "fs/promises";
import { MemoryPlugin } from "../../src/memory/memory-plugin.ts";

const testDir = join(import.meta.dir, "__tmp_memplugin__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("MemoryPlugin", () => {
	it("stores and queries memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const plugin = new MemoryPlugin({ store });

		await plugin.store({ content: "user prefers vim", type: "user" });
		const result = await plugin.query({ text: "vim", topK: 5 });
		expect(result.entries.length).toBeGreaterThan(0);
		expect(result.entries[0].content).toContain("vim");
		expect(result.entries[0].type).toBe("user");
	});

	it("extractAndStore extracts and persists from messages", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const plugin = new MemoryPlugin({ store });

		await plugin.extractAndStore("session-1");
		// No messages in session yet — should not throw
		const result = await plugin.query({ text: "anything", topK: 5 });
		expect(result.entries).toEqual([]);
	});

	it("init and destroy lifecycle", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const plugin = new MemoryPlugin({ store });

		const mockCtx = {
			logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			config: {},
			callLLM: vi.fn(async () => ({ text: "ok", model: "test" })),
			scheduleCron: vi.fn(),
		};

		await plugin.init(mockCtx);
		expect(mockCtx.scheduleCron).toHaveBeenCalled();

		await plugin.destroy();
	});

	it("query returns relevance scores", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const plugin = new MemoryPlugin({ store });

		await plugin.store({ content: "dark theme preference", type: "user" });
		await plugin.store({ content: "use bun not npm", type: "feedback" });

		const result = await plugin.query({ text: "theme", topK: 2 });
		expect(result.entries.length).toBe(2);
		expect(result.entries[0].relevanceScore).toBeDefined();
	});
});
