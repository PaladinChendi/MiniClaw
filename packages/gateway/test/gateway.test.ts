import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import type { Plugin, PluginContext } from "@ebsclaw/plugin-api";
import { mkdir, rm } from "fs/promises";
import { Gateway } from "../src/index.ts";

const tmpDir = join(import.meta.dir, "__tmp_gateway__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("Gateway", () => {
	it("creates in embedded mode by default", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		expect(gw.mode).toBe("embedded");
	});

	it("initializes all subsystems on start", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();
		expect(gw.isRunning).toBe(true);
		await gw.stop();
	});

	it("stops cleanly", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();
		await gw.stop();
		expect(gw.isRunning).toBe(false);
	});

	it("creates PluginContext with required fields", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();
		const ctx = gw.createPluginContext("test-plugin", {});
		expect(ctx.logger).toBeDefined();
		expect(ctx.config).toBeDefined();
		expect(typeof ctx.callLLM).toBe("function");
		expect(typeof ctx.scheduleCron).toBe("function");
		await gw.stop();
	});

	it("ingress pipeline fires pre_ingress hooks then processes message", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		const hookFired: string[] = [];
		gw.hookEngine.register("pre_ingress", "test", async () => {
			hookFired.push("pre_ingress");
		});
		await gw.start();
		await gw.ingress({
			id: "m1",
			channelId: "ch1",
			userId: "u1",
			content: "hello",
			timestamp: Date.now(),
		});
		expect(hookFired).toEqual(["pre_ingress"]);
		await gw.stop();
	});

	it("egress pipeline fires pre_egress hooks then processes message", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		const hookFired: string[] = [];
		gw.hookEngine.register("pre_egress", "test", async () => {
			hookFired.push("pre_egress");
		});
		await gw.start();
		await gw.egress("ch1", { content: "response" });
		expect(hookFired).toEqual(["pre_egress"]);
		await gw.stop();
	});

	it("registerPlugin registers and initializes a plugin", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		let inited = false;
		const plugin: Plugin = {
			async init(_ctx: PluginContext) {
				inited = true;
			},
			async destroy() {},
		};
		await gw.start();
		await gw.registerPlugin(
			{ name: "p1", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			plugin,
			"/fake/dir",
		);
		expect(inited).toBe(true);
		await gw.stop();
	});
});
