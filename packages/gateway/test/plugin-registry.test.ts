import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginRegistry } from "../src/plugin-registry.ts";
import { PluginLoader } from "../src/plugin-loader.ts";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import type { Plugin, PluginContext, ChannelPlugin } from "@ebsclaw/plugin-api";

const tmpDir = join(import.meta.dir, "__tmp_plugin__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

function createMockContext(): PluginContext {
	return {
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		config: {},
		callLLM: async () => ({ text: "mock", model: "mock" }),
		scheduleCron: () => {},
	};
}

describe("PluginLoader", () => {
	it("loads a plugin from manifest + index.ts", async () => {
		const pluginDir = join(tmpDir, "test-plugin");
		await mkdir(pluginDir, { recursive: true });

		await writeFile(
			join(pluginDir, "ebsclaw.manifest.json"),
			JSON.stringify({
				name: "test-plugin",
				version: "0.1.0",
				type: "channel",
				permissions: { fs: [], net: [] },
			}),
		);

		await writeFile(
			join(pluginDir, "index.ts"),
			`
export default {
  async init(ctx) { ctx.logger.info("inited"); },
  async destroy() {},
  async onMessage() {},
  async send() {},
};
`,
		);

		const loader = new PluginLoader();
		const loaded = await loader.load(pluginDir);
		expect(loaded.manifest.name).toBe("test-plugin");
		expect(typeof loaded.instance.init).toBe("function");
	});

	it("throws if manifest is missing", async () => {
		const loader = new PluginLoader();
		expect(loader.load(join(tmpDir, "empty"))).rejects.toThrow(/Manifest not found/);
	});
});

describe("PluginRegistry", () => {
	it("registers and initializes a loaded plugin", async () => {
		const registry = new PluginRegistry();
		const ctx = createMockContext();
		let inited = false;

		const plugin: Plugin = {
			async init(_ctx: PluginContext) {
				inited = true;
			},
			async destroy() {},
		};

		await registry.register(
			{ name: "p1", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			plugin,
			"/fake/dir",
			ctx,
		);

		expect(inited).toBe(true);
		expect(registry.get("p1")).toBeDefined();
	});

	it("does not register plugin if init fails", async () => {
		const registry = new PluginRegistry();
		const ctx = createMockContext();

		const plugin: Plugin = {
			async init() {
				throw new Error("init fail");
			},
			async destroy() {},
		};

		await registry.register(
			{ name: "bad", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			plugin,
			"/fake/dir",
			ctx,
		);

		expect(registry.get("bad")).toBeUndefined();
	});

	it("destroys all plugins on shutdown", async () => {
		const registry = new PluginRegistry();
		const ctx = createMockContext();
		const destroyed: string[] = [];

		const makePlugin = (name: string): Plugin => ({
			async init() {},
			async destroy() {
				destroyed.push(name);
			},
		});

		await registry.register(
			{ name: "a", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			makePlugin("a"),
			"/a",
			ctx,
		);
		await registry.register(
			{ name: "b", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			makePlugin("b"),
			"/b",
			ctx,
		);

		await registry.destroyAll();
		expect(destroyed.sort()).toEqual(["a", "b"]);
	});

	it("lists registered plugins", async () => {
		const registry = new PluginRegistry();
		const ctx = createMockContext();

		const plugin: Plugin = {
			async init() {},
			async destroy() {},
		};

		await registry.register(
			{ name: "listed", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			plugin,
			"/listed",
			ctx,
		);

		const names = registry.list().map((p) => p.manifest.name);
		expect(names).toContain("listed");
	});
});
