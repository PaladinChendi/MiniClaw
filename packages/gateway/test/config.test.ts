import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";

const tmpDir = join(import.meta.dir, "__tmp_config__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("returns DEFAULT_CONFIG when no config file exists", async () => {
		const config = await loadConfig(join(tmpDir, "nonexistent.yaml"));
		expect(config.gateway.port).toBe(DEFAULT_CONFIG.gateway.port);
		expect(config.gateway.mode).toBe("embedded");
	});

	it("parses a valid config.yaml with all fields", async () => {
		const yamlPath = join(tmpDir, "config.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  port: 9090
  mode: embedded
  pluginDirs:
    - ./ext1
    - ./ext2
channels:
  qqbot:
    appId: "12345"
    appSecret: "secret"
    enabled: true
auth:
  trustAll: true
`.trim(),
		);
		const config = await loadConfig(yamlPath);
		expect(config.gateway.port).toBe(9090);
		expect(config.gateway.mode).toBe("embedded");
		expect(config.gateway.pluginDirs).toEqual(["./ext1", "./ext2"]);
		expect(config.channels.qqbot.appId).toBe("12345");
		expect(config.channels.qqbot.enabled).toBe(true);
		expect(config.auth.trustAll).toBe(true);
	});

	it("merges partial config with defaults", async () => {
		const yamlPath = join(tmpDir, "partial.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  port: 8080
`.trim(),
		);
		const config = await loadConfig(yamlPath);
		expect(config.gateway.port).toBe(8080);
		expect(config.gateway.mode).toBe("embedded");
		expect(config.gateway.pluginDirs).toEqual([]);
	});

	it("throws on invalid mode value", async () => {
		const yamlPath = join(tmpDir, "bad-mode.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  mode: invalid
`.trim(),
		);
		expect(loadConfig(yamlPath)).rejects.toThrow(/mode must be/);
	});
});
