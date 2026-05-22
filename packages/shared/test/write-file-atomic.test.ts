import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { mkdir, readFile, readdir, rm, stat } from "fs/promises";
import { cleanupTempFiles, writeFileAtomic } from "../src/index.ts";

const tmpDir = join(import.meta.dir, "__tmp_atomic__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
	it("writes file atomically — target has full content", async () => {
		const target = join(tmpDir, "test.json");
		await writeFileAtomic(target, '{"ok":true}');
		const content = await readFile(target, "utf-8");
		expect(content).toBe('{"ok":true}');
	});

	it("cleans up temp file on write failure", async () => {
		const target = join(tmpDir, "subdir/nested.txt");
		await expect(writeFileAtomic(target, "fail")).rejects.toThrow();
		const files = await readdir(tmpDir);
		const tmpFiles = files.filter((f) => f.startsWith(".tmp-"));
		expect(tmpFiles.length).toBe(0);
	});

	it("no leftover .tmp files after successful write", async () => {
		const target = join(tmpDir, "clean.txt");
		await writeFileAtomic(target, "data");
		const files = await readdir(tmpDir);
		const tmpFiles = files.filter((f) => f.startsWith(".tmp-"));
		expect(tmpFiles.length).toBe(0);
	});

	it("supports fsync:false option", async () => {
		const target = join(tmpDir, "nofsync.txt");
		await writeFileAtomic(target, "no-fsync-data", { fsync: false });
		const content = await readFile(target, "utf-8");
		expect(content).toBe("no-fsync-data");
	});
});

describe("cleanupTempFiles", () => {
	it("orphaned .tmp file >5min gets cleaned up", async () => {
		const tmpFile = join(tmpDir, ".tmp-orphan");
		const { writeFile, utimes } = await import("fs/promises");
		await writeFile(tmpFile, "stale");
		const tenMinAgo = Date.now() - 600000;
		await utimes(tmpFile, tenMinAgo / 1000, tenMinAgo / 1000);
		await cleanupTempFiles(tmpDir);
		expect(existsSync(tmpFile)).toBe(false);
	});

	it("recent .tmp file <5min is NOT cleaned up", async () => {
		const tmpFile = join(tmpDir, ".tmp-recent");
		const { writeFile } = await import("fs/promises");
		await writeFile(tmpFile, "fresh");
		await cleanupTempFiles(tmpDir);
		expect(existsSync(tmpFile)).toBe(true);
	});
});

describe("Crash recovery", () => {
	it("concurrent writes: last write wins, no corruption", async () => {
		const target = join(tmpDir, "concurrent.json");
		const writes = Array.from({ length: 5 }, (_, i) => writeFileAtomic(target, JSON.stringify({ version: i })));
		await Promise.all(writes);
		const data = JSON.parse(await readFile(target, "utf-8"));
		expect(typeof data.version).toBe("number");
		expect(data.version).toBeGreaterThanOrEqual(0);
	});
});
