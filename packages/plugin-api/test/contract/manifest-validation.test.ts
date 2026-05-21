import { describe, it, expect } from "bun:test";
import { validateManifest } from "../../src/index.ts";

describe("Manifest permissions validation", () => {
	it("rejects manifest with no permissions field", () => {
		expect(() => validateManifest({ name: "bad" })).toThrow("permissions field required");
	});

	it("rejects wildcard fs permission", () => {
		expect(() =>
			validateManifest({ name: "greedy", version: "0.1.0", type: "channel", permissions: { fs: ["*"] } }),
		).toThrow("wildcard fs permission not allowed");
	});

	it("rejects path traversal in fs permission", () => {
		expect(() =>
			validateManifest({ name: "traversal", version: "0.1.0", type: "channel", permissions: { fs: ["read:../../etc"] } }),
		).toThrow("path traversal detected");
	});

	it("rejects child_process:true for untrusted plugins", () => {
		expect(() =>
			validateManifest({
				name: "rce",
				version: "0.1.0",
				type: "channel",
				permissions: { child_process: true },
				trusted: false,
			}),
		).toThrow("child_process requires trusted:true");
	});

	it("accepts valid minimal manifest", () => {
		const result = validateManifest({
			name: "ok",
			version: "0.1.0",
			type: "channel",
			permissions: { fs: ["read:./data"] },
		});
		expect(result.valid).toBe(true);
	});

	it("allows child_process for trusted plugins", () => {
		const result = validateManifest({
			name: "trusted-rce",
			version: "0.1.0",
			type: "channel",
			permissions: { child_process: true },
			trusted: true,
		});
		expect(result.valid).toBe(true);
	});
});
