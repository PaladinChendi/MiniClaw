import { describe, expect, it } from "bun:test";
import type { LLMOptions, PluginContext, PluginManifest, SessionSnapshot } from "../../src/index.ts";

describe("Optional property safety", () => {
	it("PluginContext destructuring ignores unknown fields", () => {
		const ctx = {
			logger: {} as any,
			config: {},
			callLLM: async () => ({}) as any,
			scheduleCron: () => {},
			extra: "new",
		} as PluginContext;
		const { logger, config, callLLM } = ctx;
		expect(logger).toBeDefined();
		expect(config).toBeDefined();
		expect(callLLM).toBeDefined();
	});

	it("PluginManifest accepts minimal required fields", () => {
		const m: PluginManifest = {
			name: "test",
			version: "0.1.0",
			type: "channel",
			permissions: { fs: [], net: [] },
		};
		expect(m.displayName).toBeUndefined();
	});

	it("SessionSnapshot optional fields do not break consumers", () => {
		const s: SessionSnapshot = {
			id: "s1",
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		expect(s.compactBoundary).toBeUndefined();
		expect(s.tokenCount).toBeUndefined();
	});

	it("LLMOptions all fields optional", () => {
		const opts: LLMOptions = {};
		expect(opts.signal).toBeUndefined();
		expect(opts.tenantId).toBeUndefined();
	});
});
