import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { Gateway } from "../src/index.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const testDir = join(import.meta.dir, "__tmp_gw_ctx__");

beforeEach(async () => { await mkdir(testDir, { recursive: true }); });
afterEach(async () => { await rm(testDir, { recursive: true, force: true }); });

describe("Gateway PluginContext extension", () => {
	it("createPluginContext includes callPlugin method", async () => {
		const gw = new Gateway({ sessionDir: testDir });
		const ctx = gw.createPluginContext("test-plugin", {});
		expect(typeof ctx.callPlugin).toBe("function");
	});

	it("createPluginContext includes getStore returning MemoryStoreHandle", async () => {
		const gw = new Gateway({ sessionDir: testDir });
		const store = new MemoryStore(testDir);
		await store.init();
		gw.setMemoryStore(store);

		const ctx = gw.createPluginContext("test-plugin", {});
		expect(typeof ctx.getStore).toBe("function");
		const handle = ctx.getStore();
		expect(handle).toBeDefined();
		// Handle should be read-only
		expect(() => (handle as any).create({ content: "x", type: "user" })).toThrow("read-only");
	});

	it("callPlugin throws for unknown plugin", async () => {
		const gw = new Gateway({ sessionDir: testDir });
		const ctx = gw.createPluginContext("caller", {});
		expect(ctx.callPlugin("unknown", "method", {})).rejects.toThrow("not found");
	});
});
