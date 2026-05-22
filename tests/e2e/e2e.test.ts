import { describe, expect, it } from "bun:test";
import { E2EHarness } from "./harness.ts";

describe("E2E Harness", () => {
	it("runs a simple prompt through full pipeline", async () => {
		const harness = new E2EHarness({ dataDir: `${import.meta.dir}/__tmp_harness__` });
		await harness.setup();
		const result = await harness.run("What is 2+2?");
		expect(result.text).toContain("4");
		await harness.teardown();
	});

	it("handles tool call flow end-to-end", async () => {
		const harness = new E2EHarness({ dataDir: `${import.meta.dir}/__tmp_harness2__` });
		await harness.setup();
		const result = await harness.runWithTool("read file test.txt", "bash", "cat test.txt");
		expect(result.toolCalled).toBe(true);
		await harness.teardown();
	});

	it("persists memory across sessions", async () => {
		const harness = new E2EHarness({ dataDir: `${import.meta.dir}/__tmp_harness3__` });
		await harness.setup();
		await harness.run("I prefer dark theme");
		const memResult = await harness.queryMemory("dark theme");
		expect(memResult.entries.length).toBeGreaterThan(0);
		await harness.teardown();
	});
});
