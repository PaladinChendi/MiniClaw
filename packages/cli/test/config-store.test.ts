import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConfigStore } from "../src/config-store.ts";
import { mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const testDir = join(import.meta.dir, "__tmp_config__");
const configFile = join(testDir, "ebsclaw.yaml");

beforeEach(async () => { await mkdir(testDir, { recursive: true }); });
afterEach(async () => { await rm(testDir, { recursive: true, force: true }); });

describe("ConfigStore", () => {
	it("saves provider config to YAML file", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "anthropic", apiKey: "sk-test-123" });

		expect(existsSync(configFile)).toBe(true);
		const content = await readFile(configFile, "utf-8");
		expect(content).toContain("anthropic");
		expect(content).toContain("sk-test-123");
	});

	it("loads existing config from YAML file", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "openai", apiKey: "sk-openai" });

		const loaded = await store.load();
		expect(loaded.provider).toBe("openai");
		expect(loaded.apiKey).toBe("sk-openai");
	});

	it("returns null when config file does not exist", async () => {
		const store = new ConfigStore(join(testDir, "nonexistent.yaml"));
		const loaded = await store.load();
		expect(loaded).toBeNull();
	});

	it("overwrites existing config on save", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "anthropic", apiKey: "sk-old" });
		await store.save({ provider: "google", apiKey: "sk-new" });

		const loaded = await store.load();
		expect(loaded!.provider).toBe("google");
		expect(loaded!.apiKey).toBe("sk-new");
	});
});
