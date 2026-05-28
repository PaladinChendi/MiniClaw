import { describe, expect, it } from "bun:test";
import { AuthSystem } from "../src/auth.ts";

describe("AuthSystem", () => {
	it("trustAll=true accepts any plugin", () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.isTrusted("any-plugin")).toBe(true);
	});

	it("trustAll=false with trustList accepts listed plugins", () => {
		const auth = new AuthSystem({ trustAll: false, trustList: ["qqbot", "memory"] });
		expect(auth.isTrusted("qqbot")).toBe(true);
		expect(auth.isTrusted("unknown")).toBe(false);
	});

	it("maskApiKey hides all but last 4 chars", () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.maskApiKey("sk-ant-1234567890abcdefghijklmnop")).toBe("sk-ant-...mnop");
	});

	it("maskApiKey returns [REDACTED] for short keys", () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.maskApiKey("abc")).toBe("[REDACTED]");
	});

	it("checkPermission allows fs access for trusted plugin", () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.checkPermission("p1", "fs", "read:./data")).toBe(true);
	});

	it("checkPermission denies undeclared fs access for untrusted plugin", () => {
		const auth = new AuthSystem({ trustAll: false, trustList: [] });
		expect(auth.checkPermission("untrusted", "fs", "read:./data")).toBe(false);
	});
});
