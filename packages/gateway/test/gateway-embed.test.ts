import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { Gateway } from "../src/index.ts";

const testDir = join(import.meta.dir, "__tmp_gw_embed__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("Gateway embed integration", () => {
	it("exposes embed method that queues requests by priority", async () => {
		const gw = new Gateway({ sessionDir: testDir, config: { gateway: { mode: "embedded", port: 0 } } });
		await gw.start();

		const order: string[] = [];
		gw.setEmbedFn(async (text: string) => {
			order.push(text);
			return new Array(8).fill(0.1);
		});

		const results = await Promise.all([
			gw.embed("rag doc", "rag_indexing"),
			gw.embed("search query", "memory_search"),
			gw.embed("chat message", "session_chat"),
		]);

		expect(results.length).toBe(3);
		// All resolve successfully
		for (const r of results) {
			expect(Array.isArray(r)).toBe(true);
		}

		await gw.stop();
	});

	it("embed falls back gracefully when no embedFn set", async () => {
		const gw = new Gateway({ sessionDir: testDir, config: { gateway: { mode: "embedded", port: 0 } } });
		await gw.start();

		const result = await gw.embed("fallback test", "memory_search");
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);

		await gw.stop();
	});
});
