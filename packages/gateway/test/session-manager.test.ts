import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "../src/session-manager.ts";
import { mkdir, rm, readFile, stat } from "fs/promises";
import { join } from "path";

const tmpDir = join(import.meta.dir, "__tmp_session__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("SessionManager", () => {
	it("creates a new session with defaults", async () => {
		const sm = new SessionManager(tmpDir);
		const session = await sm.create("s1");
		expect(session.id).toBe("s1");
		expect(session.messages).toEqual([]);
		expect(typeof session.createdAt).toBe("number");
		expect(typeof session.updatedAt).toBe("number");
	});

	it("persists session to disk", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("s1");
		const filePath = join(tmpDir, "s1.json");
		const content = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(content);
		expect(parsed.id).toBe("s1");
	});

	it("loads session from disk", async () => {
		const sm1 = new SessionManager(tmpDir);
		await sm1.create("s1");
		await sm1.updateMessages("s1", [{ role: "user", content: "hi" }]);

		const sm2 = new SessionManager(tmpDir);
		const loaded = await sm2.load("s1");
		expect(loaded.messages).toEqual([{ role: "user", content: "hi" }]);
	});

	it("lists all sessions", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("s1");
		await sm.create("s2");
		const ids = await sm.list();
		expect(ids.sort()).toEqual(["s1", "s2"]);
	});

	it("deletes session and its file", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("s1");
		await sm.delete("s1");
		const ids = await sm.list();
		expect(ids).toEqual([]);
	});

	it("updateMessages persists changes", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("s1");
		await sm.updateMessages("s1", [{ role: "user", content: "hello" }]);

		const sm2 = new SessionManager(tmpDir);
		const loaded = await sm2.load("s1");
		expect(loaded.messages).toEqual([{ role: "user", content: "hello" }]);
	});

	it("throws on load of nonexistent session", async () => {
		const sm = new SessionManager(tmpDir);
		expect(sm.load("ghost")).rejects.toThrow(/not found/);
	});

	it("write is atomic — no .tmp files remain after save", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("s1");
		const { readdir } = await import("fs/promises");
		const files = await readdir(tmpDir);
		const tmpFiles = files.filter((f) => f.startsWith(".tmp-"));
		expect(tmpFiles.length).toBe(0);
	});
});
