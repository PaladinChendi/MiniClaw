import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createEnvProxy } from "../../../shared/src/index.ts";

describe("Security attack vectors", () => {
	it("env proxy only exposes declared variables", () => {
		process.env.__EBSCLAW_TEST_SECRET = "leak-me";
		process.env.__EBSCLAW_TEST_ALLOWED = "visible";
		const proxy = createEnvProxy(["__EBSCLAW_TEST_ALLOWED"]);
		expect(proxy.__EBSCLAW_TEST_ALLOWED).toBe("visible");
		expect((proxy as any).__EBSCLAW_TEST_SECRET).toBeUndefined();
		delete process.env.__EBSCLAW_TEST_SECRET;
		delete process.env.__EBSCLAW_TEST_ALLOWED;
	});

	it("env proxy hides undeclared keys from Object.keys", () => {
		process.env.__EBSCLAW_TEST_ANOTHER = "hidden";
		const proxy = createEnvProxy([]);
		const keys = Object.keys(proxy);
		expect(keys).not.toContain("__EBSCLAW_TEST_ANOTHER");
		delete process.env.__EBSCLAW_TEST_ANOTHER;
	});

	it("env proxy returns undefined for unset whitelisted vars", () => {
		const proxy = createEnvProxy(["__EBSCLAW_TEST_NEVER_SET"]);
		expect(proxy.__EBSCLAW_TEST_NEVER_SET).toBeUndefined();
	});

	it("env proxy blocks write attempts", () => {
		const proxy = createEnvProxy([]);
		(proxy as any).__EBSCLAW_TEST_INJECT = "injected";
		expect((proxy as any).__EBSCLAW_TEST_INJECT).toBeUndefined();
	});
});
