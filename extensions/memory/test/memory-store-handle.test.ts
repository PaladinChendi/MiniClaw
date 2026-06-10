import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { MemoryStore } from "@miniclaw/gateway/src/memory-store";
import { MemoryStoreHandle } from "@miniclaw/gateway/src/memory-store-handle";
import { mkdir, rm } from "fs/promises";

const testDir = join(import.meta.dir, "__tmp_handle__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("MemoryStoreHandle", () => {
	it("read returns entry from underlying store", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({ content: "hello", type: "user" });
		const handle = new MemoryStoreHandle(store);
		const entry = await handle.read(id);
		expect(entry).toBeDefined();
		expect(entry!.content).toBe("hello");
	});

	it("list returns entries from underlying store", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		await store.create({ content: "a", type: "user" });
		await store.create({ content: "b", type: "feedback" });
		const handle = new MemoryStoreHandle(store);
		const entries = await handle.list();
		expect(entries.length).toBe(2);
	});

	it("create throws — handle is read-only", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const handle = new MemoryStoreHandle(store);
		expect(() => (handle as any).create({ content: "x", type: "user" })).toThrow("read-only");
	});

	it("update throws — handle is read-only", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const handle = new MemoryStoreHandle(store);
		expect(() => (handle as any).update("id", { content: "x" })).toThrow("read-only");
	});

	it("delete throws — handle is read-only", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const handle = new MemoryStoreHandle(store);
		expect(() => (handle as any).delete("id")).toThrow("read-only");
	});
});
