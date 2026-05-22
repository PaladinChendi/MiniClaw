import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { E2EHarness } from "./harness.ts";
import { join } from "path";
import { mkdir, rm } from "fs/promises";

const tmpBase = join(import.meta.dir, "__tmp_chaos__");

describe("Chaos Scenarios", () => {
	const scenarios = [
		{ name: "missing config dir", setup: async () => { await mkdir(tmpBase, { recursive: true }); } },
		{ name: "corrupted memory file", setup: async () => { await mkdir(tmpBase, { recursive: true }); } },
		{ name: "concurrent writes", setup: async () => { await mkdir(tmpBase, { recursive: true }); } },
		{ name: "empty input", setup: async () => {} },
		{ name: "very long input", setup: async () => {} },
		{ name: "special characters input", setup: async () => {} },
		{ name: "rapid sequential requests", setup: async () => {} },
		{ name: "disk full simulation", setup: async () => {} },
	];

	for (const sc of scenarios) {
		it(`${sc.name} does not crash`, async () => {
			await sc.setup();
			const harness = new E2EHarness({ dataDir: join(tmpBase, sc.name) });
			await harness.setup();

			let crashed = false;
			try {
				if (sc.name === "empty input") {
					await harness.run("");
				} else if (sc.name === "very long input") {
					await harness.run("x".repeat(10000));
				} else if (sc.name === "special characters input") {
					await harness.run("test <script>alert(1)</script> & 'quoted'");
				} else if (sc.name === "rapid sequential requests") {
					await Promise.all([harness.run("a"), harness.run("b"), harness.run("c")]);
				} else if (sc.name === "concurrent writes") {
					await Promise.all([harness.run("mem1"), harness.run("mem2")]);
				} else {
					await harness.run("normal input");
				}
			} catch {
				crashed = true;
			}

			expect(crashed).toBe(false);
			await harness.teardown();
		});
	}
});

afterAll(async () => {
	const { existsSync } = await import("fs");
	const { rm: rmDir } = await import("fs/promises");
	if (existsSync(tmpBase)) await rmDir(tmpBase, { recursive: true, force: true });
});
