import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import { mkdir, readFile, rm } from "fs/promises";
import { MemoryExtractor } from "../../src/memory/extract";

const testDir = join(import.meta.dir, "__tmp_extract__");
const memDir = join(testDir, "memories");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("MemoryExtractor", () => {
	it("extracts user preferences from conversation", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const extractor = new MemoryExtractor(store);

		const messages = [
			{ role: "user" as const, content: "I prefer dark theme in my editor" },
			{ role: "assistant" as const, content: "Noted, you like dark theme." },
		];

		const ids = await extractor.extract(messages);
		expect(ids.length).toBeGreaterThan(0);

		const entry = await store.read(ids[0]);
		expect(entry).toBeDefined();
		expect(entry!.content).toContain("dark theme");
		expect(entry!.type).toBe("user");
	});

	it("extracts feedback memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const extractor = new MemoryExtractor(store);

		const messages = [{ role: "user" as const, content: "Don't use semicolons, it's cleaner without them" }];

		const ids = await extractor.extract(messages);
		expect(ids.length).toBeGreaterThan(0);
		const entry = await store.read(ids[0]);
		expect(entry!.type).toBe("feedback");
	});

	it("extracts project context memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const extractor = new MemoryExtractor(store);

		const messages = [{ role: "user" as const, content: "We're building a CLI tool called ebsclaw for AI agents" }];

		const ids = await extractor.extract(messages);
		expect(ids.length).toBeGreaterThan(0);
		const entry = await store.read(ids[0]);
		expect(entry!.type).toBe("project");
	});

	it("writes session notes.md", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const extractor = new MemoryExtractor(store, { sessionDir: testDir });

		const messages = [{ role: "user" as const, content: "I like vim keybindings" }];

		await extractor.extract(messages);
		const notesPath = join(testDir, "notes.md");
		expect(existsSync(notesPath)).toBe(true);
		const content = await readFile(notesPath, "utf-8");
		expect(content.length).toBeGreaterThan(0);
	});

	it("skips extraction when no relevant content", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const extractor = new MemoryExtractor(store);

		const messages = [
			{ role: "user" as const, content: "Hello" },
			{ role: "assistant" as const, content: "Hi there!" },
		];

		const ids = await extractor.extract(messages);
		expect(ids).toEqual([]);
	});
});
