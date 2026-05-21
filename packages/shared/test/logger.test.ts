import { describe, it, expect } from "bun:test";
import { createStructuredLogger } from "../src/index.ts";

describe("Structured logger", () => {
	it("outputs valid JSON with required fields", () => {
		const lines: string[] = [];
		const logger = createStructuredLogger("test-plugin", (msg) => lines.push(msg));
		logger.info("hello", { traceId: "abc" });
		const parsed = JSON.parse(lines[0]);
		expect(parsed.pluginId).toBe("test-plugin");
		expect(parsed.level).toBe("info");
		expect(parsed.msg).toBe("hello");
		expect(parsed.traceId).toBe("abc");
		expect(typeof parsed.ts).toBe("number");
	});

	it("redacts API key patterns from message", () => {
		const lines: string[] = [];
		const logger = createStructuredLogger("p", (msg) => lines.push(msg));
		logger.info("key=sk-ant-1234567890abcdefghijklmnopqrst");
		const parsed = JSON.parse(lines[0]);
		expect(parsed.msg).not.toContain("sk-ant-");
		expect(parsed.msg).toContain("[REDACTED]");
	});

	it("redacts API key patterns from metadata values", () => {
		const lines: string[] = [];
		const logger = createStructuredLogger("p", (msg) => lines.push(msg));
		logger.info("test", { apiKey: "sk-ant-1234567890abcdefghijklmnopqrst" });
		const parsed = JSON.parse(lines[0]);
		expect(parsed.apiKey).toBe("[REDACTED]");
	});

	it("supports all log levels", () => {
		const lines: string[] = [];
		const logger = createStructuredLogger("p", (msg) => lines.push(msg));
		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		logger.error("e");
		expect(lines.length).toBe(4);
		const levels = lines.map((l) => JSON.parse(l).level);
		expect(levels).toEqual(["debug", "info", "warn", "error"]);
	});
});
