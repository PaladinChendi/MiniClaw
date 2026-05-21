import { describe, it, expect } from "bun:test";
import { HeartbeatSystem } from "../src/heartbeat.ts";

describe("HeartbeatSystem", () => {
	it("registers a health check", () => {
		const hb = new HeartbeatSystem();
		hb.register("db", async () => true);
		const checks = hb.listChecks();
		expect(checks).toContain("db");
	});

	it("isAlive returns true when all checks pass", async () => {
		const hb = new HeartbeatSystem();
		hb.register("db", async () => true);
		hb.register("cache", async () => true);
		const alive = await hb.isAlive();
		expect(alive).toBe(true);
	});

	it("isAlive returns false when any check fails", async () => {
		const hb = new HeartbeatSystem();
		hb.register("db", async () => true);
		hb.register("redis", async () => false);
		const alive = await hb.isAlive();
		expect(alive).toBe(false);
	});

	it("isAlive returns true when no checks registered", async () => {
		const hb = new HeartbeatSystem();
		const alive = await hb.isAlive();
		expect(alive).toBe(true);
	});

	it("check throws are treated as failure", async () => {
		const hb = new HeartbeatSystem();
		hb.register("flake", async () => {
			throw new Error("timeout");
		});
		const alive = await hb.isAlive();
		expect(alive).toBe(false);
	});

	it("unregister removes a check", () => {
		const hb = new HeartbeatSystem();
		hb.register("temp", async () => true);
		hb.unregister("temp");
		expect(hb.listChecks()).toEqual([]);
	});
});
