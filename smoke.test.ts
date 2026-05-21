import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const root = import.meta.dir;

function globDirs(pattern: string): string[] {
	if (!pattern.endsWith("*")) return [join(root, pattern)];
	const base = pattern.slice(0, -1); // remove trailing *
	const entries = readdirSync(join(root, base), { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => join(root, base, e.name));
}

describe("Monorepo smoke test", () => {
	it("root package.json defines workspaces", () => {
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
		expect(pkg.workspaces).toBeArray();
		expect(pkg.workspaces.length).toBeGreaterThan(0);
	});

	it("all workspace packages have package.json", () => {
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
		for (const ws of pkg.workspaces) {
			const dirs = ws.endsWith("*")
				? globDirs(ws)
				: [join(root, ws)];
			for (const dir of dirs) {
				expect(existsSync(join(dir, "package.json"))).toBeTrue();
			}
		}
	});

	it("stub channel manifests have status:stub", () => {
		const stubs = ["slack", "discord", "telegram", "wechat", "feishu", "matrix", "irc"];
		for (const name of stubs) {
			const manifest = JSON.parse(
				readFileSync(join(root, "extensions/channels", name, "ebsclaw.manifest.json"), "utf-8"),
			);
			expect(manifest.status).toBe("stub");
		}
	});

	it("qqbot manifest has status:implemented", () => {
		const manifest = JSON.parse(
			readFileSync(join(root, "extensions/channels/qqbot/ebsclaw.manifest.json"), "utf-8"),
		);
		expect(manifest.status).toBe("implemented");
	});
});
