import { describe, expect, it } from "bun:test";
import { CronScheduler } from "../src/cron-scheduler.ts";

describe("CronScheduler", () => {
	it("registers and runs a cron job", async () => {
		const scheduler = new CronScheduler();
		let count = 0;
		scheduler.register(
			"job1",
			"* * * * *",
			async () => {
				count++;
			},
			{ jitterMs: 0, minIntervalMs: 0, pluginName: "test" },
		);
		await scheduler.tryRun("job1");
		expect(count).toBe(1);
	});

	it("deterministic jitter is based on job id", () => {
		const scheduler = new CronScheduler();
		const j1 = scheduler.computeJitter("job1", 1000);
		const j2 = scheduler.computeJitter("job2", 1000);
		expect(typeof j1).toBe("number");
		expect(j1).toBeGreaterThanOrEqual(0);
		expect(j1).not.toBe(j2);
	});

	it("same id always produces same jitter", () => {
		const scheduler = new CronScheduler();
		const j1 = scheduler.computeJitter("consistent", 1000);
		const j2 = scheduler.computeJitter("consistent", 1000);
		expect(j1).toBe(j2);
	});

	it("respects min interval — skips if called too soon", async () => {
		const scheduler = new CronScheduler();
		let count = 0;
		scheduler.register(
			"frequent",
			"* * * * *",
			async () => {
				count++;
			},
			{ jitterMs: 0, minIntervalMs: 60000, pluginName: "test" },
		);
		await scheduler.tryRun("frequent");
		expect(count).toBe(1);
		await scheduler.tryRun("frequent");
		expect(count).toBe(1);
	});

	it("tryRun returns false on unknown job", async () => {
		const scheduler = new CronScheduler();
		const result = await scheduler.tryRun("ghost");
		expect(result).toBe(false);
	});

	it("unregister removes a job", async () => {
		const scheduler = new CronScheduler();
		let count = 0;
		scheduler.register(
			"temp",
			"* * * * *",
			async () => {
				count++;
			},
			{ jitterMs: 0, minIntervalMs: 0, pluginName: "test" },
		);
		scheduler.unregister("temp");
		const result = await scheduler.tryRun("temp");
		expect(result).toBe(false);
	});

	it("computeJitter returns 0 when jitterMs is 0", () => {
		const scheduler = new CronScheduler();
		expect(scheduler.computeJitter("any", 0)).toBe(0);
	});
});
