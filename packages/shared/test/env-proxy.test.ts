import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createEnvProxy } from "../src/index.ts";

describe("createEnvProxy", () => {
	it("exposes only whitelisted env vars", () => {
		process.env.__EBSCLAW_TEST_FOO = "bar";
		process.env.__EBSCLAW_TEST_SECRET = "hidden";
		const env = createEnvProxy(["__EBSCLAW_TEST_FOO"]);
		expect(env.__EBSCLAW_TEST_FOO).toBe("bar");
		expect((env as any).__EBSCLAW_TEST_SECRET).toBeUndefined();
		delete process.env.__EBSCLAW_TEST_FOO;
		delete process.env.__EBSCLAW_TEST_SECRET;
	});

	it("hides non-whitelisted keys from Object.keys", () => {
		process.env.__EBSCLAW_TEST_BAZ = "qux";
		const env = createEnvProxy(["__EBSCLAW_TEST_BAZ"]);
		const keys = Object.keys(env);
		expect(keys).toContain("__EBSCLAW_TEST_BAZ");
		expect(keys).not.toContain("PATH");
		delete process.env.__EBSCLAW_TEST_BAZ;
	});

	it("returns undefined for unset whitelisted vars", () => {
		const env = createEnvProxy(["__EBSCLAW_TEST_NEVER_SET"]);
		expect(env.__EBSCLAW_TEST_NEVER_SET).toBeUndefined();
	});

	it("blocks write attempts", () => {
		const env = createEnvProxy([]);
		(env as any).__EBSCLAW_TEST_INJECT = "injected";
		expect((env as any).__EBSCLAW_TEST_INJECT).toBeUndefined();
	});
});
