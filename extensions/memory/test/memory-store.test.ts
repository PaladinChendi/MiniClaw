import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import { mkdir, rm } from "fs/promises";

const testDir = join(import.meta.dir, "__tmp_memstore__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("MemoryStore", () => {
	it("create + read round-trip", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({
			content: "user prefers dark theme",
			type: "user",
			scope: "private",
		});
		const entry = await store.read(id);
		expect(entry).toBeDefined();
		expect(entry!.content).toBe("user prefers dark theme");
		expect(entry!.type).toBe("user");
	});

	it("update modifies content", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({ content: "old", type: "feedback" });
		await store.update(id, { content: "new" });
		const entry = await store.read(id);
		expect(entry!.content).toBe("new");
	});

	it("delete removes entry", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({ content: "gone", type: "project" });
		await store.delete(id);
		const entry = await store.read(id);
		expect(entry).toBeNull();
	});

	it("list returns all entries with metadata", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		await store.create({ content: "a", type: "user" });
		await store.create({ content: "b", type: "feedback" });
		const entries = await store.list();
		expect(entries.length).toBe(2);
		expect(entries[0].name).toBeDefined();
		expect(entries[0].description).toBeDefined();
		expect(entries[0].type).toBeDefined();
		const types = entries.map((e) => e.type);
		expect(types).toContain("user");
		expect(types).toContain("feedback");
	});

	it("read returns scope from frontmatter", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({
			content: "team knowledge",
			type: "project",
			scope: "team",
		});
		const entry = await store.read(id);
		expect(entry).toBeDefined();
		expect(entry!.scope).toBe("team");
	});

	it("read returns distinct createdAt/updatedAt timestamps", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({ content: "timestamp test", type: "user" });
		const entry = await store.read(id);
		expect(entry).toBeDefined();
		expect(entry!.createdAt).toBeGreaterThan(0);
		expect(entry!.updatedAt).toBeGreaterThanOrEqual(entry!.createdAt);
	});

	it("read uses exact filename match, not substring", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id1 = await store.create({ content: "alpha", type: "user" });
		const id2 = await store.create({ content: "beta", type: "user" });
		const entry1 = await store.read(id1);
		const entry2 = await store.read(id2);
		expect(entry1!.content).toBe("alpha");
		expect(entry2!.content).toBe("beta");
	});

	it("MEMORY.md index stays under 200 lines", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		for (let i = 0; i < 50; i++) {
			await store.create({ content: `memory ${i}`, type: "user" });
		}
		const { readFile } = await import("fs/promises");
		const index = await readFile(join(testDir, "MEMORY.md"), "utf-8");
		const lines = index.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeLessThanOrEqual(200);
	});
});
