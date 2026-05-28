import { describe, expect, it } from "bun:test";
import { COMMANDS, parseArgs } from "../src/commands.ts";

describe("parseArgs", () => {
	it("parses 'gateway start' command", () => {
		const result = parseArgs(["gateway", "start"]);
		expect(result.command).toBe("gateway-start");
	});

	it("parses 'tui' command with default embedded mode", () => {
		const result = parseArgs(["tui"]);
		expect(result.command).toBe("tui");
		expect(result.mode).toBe("embedded");
	});

	it("parses 'tui --mode gateway'", () => {
		const result = parseArgs(["tui", "--mode", "gateway"]);
		expect(result.command).toBe("tui");
		expect(result.mode).toBe("gateway");
	});

	it("returns help for unknown commands", () => {
		const result = parseArgs(["unknown"]);
		expect(result.command).toBe("help");
	});

	it("returns help for no args", () => {
		const result = parseArgs([]);
		expect(result.command).toBe("help");
	});

	it("parses 'gateway start --config /tmp/test.yaml'", () => {
		const result = parseArgs(["gateway", "start", "--config", "/tmp/test.yaml"]);
		expect(result.command).toBe("gateway-start");
		expect(result.configPath).toBe("/tmp/test.yaml");
	});
});

describe("COMMANDS", () => {
	it("contains gateway-start", () => {
		expect(COMMANDS.has("gateway-start")).toBe(true);
	});

	it("contains tui", () => {
		expect(COMMANDS.has("tui")).toBe(true);
	});

	it("contains help", () => {
		expect(COMMANDS.has("help")).toBe(true);
	});
});
