import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import type { Plugin, PluginContext, PluginManifest } from "@ebsclaw/plugin-api";
import { mkdir, rm } from "fs/promises";
import { Gateway, MemoryStore } from "../src/index.ts";

const tmpDir = join(import.meta.dir, "__tmp_gw_int__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// I-GP-01: Plugin init/destroy lifecycle
// ---------------------------------------------------------------------------
describe("Gateway integration: I-GP-01 plugin lifecycle", () => {
	it("calls init on start and destroy on stop", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });

		const initSpy = vi.fn(async (_ctx: PluginContext) => {});
		const destroySpy = vi.fn(async () => {});

		const plugin: Plugin = {
			init: initSpy,
			destroy: destroySpy,
		};

		const manifest: PluginManifest = {
			name: "lifecycle-plugin",
			version: "1.0.0",
			type: "skill",
			permissions: { fs: [], net: [] },
		};

		await gw.start();
		await gw.registerPlugin(manifest, plugin, "/fake/dir");
		expect(initSpy).toHaveBeenCalledTimes(1);

		await gw.stop();
		expect(destroySpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// I-GP-02: pre_ingress hook modifies message
// ---------------------------------------------------------------------------
describe("Gateway integration: I-GP-02 pre_ingress modifies message", () => {
	it("hook mutates message content before processing", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		const msg = {
			id: "m1",
			channelId: "ch1",
			userId: "u1",
			content: "original",
			timestamp: Date.now(),
		};

		// Register a hook that mutates the message content
		gw.hookEngine.register("pre_ingress", "mutate-hook", async (data: unknown) => {
			const m = data as { content: string };
			m.content = "mutated";
		});

		await gw.ingress(msg);
		// After the hook fires, the message content should have been mutated
		expect(msg.content).toBe("mutated");

		await gw.stop();
	});
});

// ---------------------------------------------------------------------------
// I-GP-03: Hook error isolation
// ---------------------------------------------------------------------------
describe("Gateway integration: I-GP-03 hook error isolation", () => {
	it("first hook throws, second hook still executes, gateway does not crash", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		const secondHookCalled: string[] = [];

		// Register two hooks on the same event
		gw.hookEngine.register("pre_ingress", "bad-hook", async () => {
			throw new Error("hook crash");
		});
		gw.hookEngine.register("pre_ingress", "good-hook", async () => {
			secondHookCalled.push("good-hook");
		});

		// ingress should not throw even though a hook throws
		await expect(
			gw.ingress({
				id: "m1",
				channelId: "ch1",
				userId: "u1",
				content: "test",
				timestamp: Date.now(),
			}),
		).resolves.toBeUndefined();

		// Second hook should still have been called
		expect(secondHookCalled).toEqual(["good-hook"]);

		await gw.stop();
	});
});

// ---------------------------------------------------------------------------
// I-GP-04: callPlugin cross-plugin call
// ---------------------------------------------------------------------------
describe("Gateway integration: I-GP-04 callPlugin cross-plugin", () => {
	it("plugin A can call method on plugin B via ctx.callPlugin", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		let capturedResult: unknown = null;

		// Plugin B exposes a method
		const pluginB: Plugin & { greet: (args: Record<string, unknown>) => Promise<string> } = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			async greet(args: Record<string, unknown>) {
				return `Hello, ${args.name}!`;
			},
		};

		// Plugin A calls plugin B during init
		const pluginA: Plugin = {
			async init(ctx: PluginContext) {
				capturedResult = await ctx.callPlugin("plugin-b", "greet", { name: "World" });
			},
			async destroy() {},
		};

		await gw.registerPlugin(
			{ name: "plugin-b", version: "1.0.0", type: "skill", permissions: { fs: [], net: [] } },
			pluginB,
			"/fake/b",
		);
		await gw.registerPlugin(
			{ name: "plugin-a", version: "1.0.0", type: "skill", permissions: { fs: [], net: [] } },
			pluginA,
			"/fake/a",
		);

		expect(capturedResult).toBe("Hello, World!");

		await gw.stop();
	});
});

// ---------------------------------------------------------------------------
// I-GP-05: getStore returns read-only MemoryStoreHandle
// ---------------------------------------------------------------------------
describe("Gateway integration: I-GP-05 getStore read-only handle", () => {
	it("create() on handle throws read-only error", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		// Set up a real MemoryStore so getStore doesn't throw
		const store = new MemoryStore(tmpDir);
		await store.init();
		gw.setMemoryStore(store);

		let handle: import("@ebsclaw/plugin-api").MemoryStoreHandle | null = null;

		const plugin: Plugin = {
			async init(ctx: PluginContext) {
				handle = ctx.getStore();
			},
			async destroy() {},
		};

		await gw.registerPlugin(
			{ name: "store-test-plugin", version: "1.0.0", type: "skill", permissions: { fs: [], net: [] } },
			plugin,
			"/fake/dir",
		);

		expect(handle).not.toBeNull();

		// The handle's create method throws a read-only error synchronously
		expect(() => (handle as any).create({ content: "test", type: "user" })).toThrow("read-only");

		await gw.stop();
	});
});
