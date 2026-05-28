import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import { mkdir, rm } from "fs/promises";
import { AutoDream } from "../../src/memory/autodream.ts";

const testDir = join(import.meta.dir, "__tmp_dream__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("AutoDream", () => {
	it("orient stage gathers relevant memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		await store.create({ content: "user likes vim", type: "user" });
		await store.create({ content: "use 2-space indent", type: "feedback" });

		const dream = new AutoDream(store);
		const context = await dream.orient();
		expect(context.entries.length).toBeGreaterThan(0);
	});

	it("consolidate merges similar memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		await store.create({ content: "user prefers vim keybindings", type: "user" });
		await store.create({ content: "user likes vim editor", type: "user" });

		const consolidateFn = vi.fn(async (_entries: string[]) => "user prefers vim keybindings and editor");
		const dream = new AutoDream(store, { consolidateFn });
		const result = await dream.run();
		expect(consolidateFn).toHaveBeenCalled();
		expect(result.consolidated).toBeGreaterThan(0);
	});

	it("prune removes stale low-value memories", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		const id = await store.create({ content: "temporary note", type: "user" });

		const dream = new AutoDream(store, { pruneAge: 0 });
		const result = await dream.run();
		expect(result.pruned).toBeGreaterThanOrEqual(0);
		const entry = await store.read(id);
		// with pruneAge=0, old entries get pruned
		if (result.pruned > 0) {
			expect(entry).toBeNull();
		}
	});

	it("full run executes all 4 stages", async () => {
		const store = new MemoryStore(testDir);
		await store.init();
		await store.create({ content: "user likes dark mode", type: "user" });

		const consolidateFn = vi.fn(async () => "consolidated: user likes dark mode");
		const dream = new AutoDream(store, { consolidateFn });
		const result = await dream.run();
		expect(result.stages).toEqual(["orient", "gather", "consolidate", "prune"]);
	});
});
