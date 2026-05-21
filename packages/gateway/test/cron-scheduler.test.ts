import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronScheduler } from "../src/cron-scheduler.ts";

describe("CronScheduler", () => {
	it("registers and runs a cron job", async () => {
		const scheduler = new CronScheduler({ minIntervalMs: 0 });
		let count = 0;
		scheduler.register("job1", "* * * * *", async () => {
			count++;
		});
		await scheduler.tryRun("job1");
		expect(count).toBe(1);
	});

	it("deterministic jitter is based on job id", () => {
		const scheduler = new CronScheduler({ minIntervalMs: 0 });
		const j1 = scheduler.getJitterMs("job1");
		const j2 = scheduler.getJitterMs("job2");
		expect(typeof j1).toBe("number");
		expect(j1).toBeGreaterThanOrEqual(0);
		expect(j1).not.toBe(j2);
	});

	it("same id always produces same jitter", () => {
		const scheduler = new CronScheduler({ minIntervalMs: 0 });
		const j1 = scheduler.getJitterMs("consistent");
		const j2 = scheduler.getJitterMs("consistent");
		expect(j1).toBe(j2);
	});

	it("respects min interval — skips if called too soon", async () => {
		const scheduler = new CronScheduler({ minIntervalMs: 60000 });
		let count = 0;
		scheduler.register("frequent", "* * * * *", async () => {
			count++;
		});
		await scheduler.tryRun("frequent");
		expect(count).toBe(1);
		await scheduler.tryRun("frequent");
		expect(count).toBe(1); // skipped
	});

	it("tryRun throws on unknown job", async () => {
		const scheduler = new CronScheduler({ minIntervalMs: 0 });
		expect(scheduler.tryRun("ghost")).rejects.toThrow(/not registered/);
	});

	it("unregister removes a job", async () => {
		const scheduler = new CronScheduler({ minIntervalMs: 0 });
		let count = 0;
		scheduler.register("temp", "* * * * *", async () => {
			count++;
		});
		scheduler.unregister("temp");
		expect(scheduler.tryRun("temp")).rejects.toThrow(/not registered/);
	});
});
