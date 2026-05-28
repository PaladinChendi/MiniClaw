import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { mkdir, readFile, rm } from "fs/promises";
import { ConfigStore } from "../src/config-store.ts";

const testDir = join(import.meta.dir, "__tmp_config__");
const configFile = join(testDir, "ebsclaw.yaml");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("ConfigStore", () => {
	it("saves config to YAML file", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "openai", baseUrl: "", apiKey: "sk-test-123", model: "gpt-4o" });

		expect(existsSync(configFile)).toBe(true);
		const content = await readFile(configFile, "utf-8");
		expect(content).toContain("gpt-4o");
		expect(content).toContain("sk-test-123");
		expect(content).toContain("openai");
	});

	it("loads existing config from YAML file", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-openai", model: "gpt-4o" });

		const loaded = await store.load();
		expect(loaded!.provider).toBe("openai");
		expect(loaded!.model).toBe("gpt-4o");
		expect(loaded!.apiKey).toBe("sk-openai");
		expect(loaded!.baseUrl).toBe("https://api.openai.com/v1");
	});

	it("returns null when config file does not exist", async () => {
		const store = new ConfigStore(join(testDir, "nonexistent.yaml"));
		const loaded = await store.load();
		expect(loaded).toBeNull();
	});

	it("overwrites existing config on save", async () => {
		const store = new ConfigStore(configFile);
		await store.save({ provider: "anthropic", baseUrl: "", apiKey: "sk-old", model: "gpt-4o" });
		await store.save({ provider: "kcode", baseUrl: "", apiKey: "sk-new", model: "glm-5.1" });

		const loaded = await store.load();
		expect(loaded!.provider).toBe("kcode");
		expect(loaded!.model).toBe("glm-5.1");
		expect(loaded!.apiKey).toBe("sk-new");
	});
});
