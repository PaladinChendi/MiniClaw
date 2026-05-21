interface CronJob {
	id: string;
	spec: string;
	handler: () => Promise<void>;
	lastRunAt: number;
}

export class CronScheduler {
	private jobs = new Map<string, CronJob>();
	private minIntervalMs: number;
	private maxJitterMs: number;

	constructor(opts: { minIntervalMs?: number; maxJitterMs?: number } = {}) {
		this.minIntervalMs = opts.minIntervalMs ?? 60000;
		this.maxJitterMs = opts.maxJitterMs ?? 10000;
	}

	register(id: string, spec: string, handler: () => Promise<void>): void {
		this.jobs.set(id, { id, spec, handler, lastRunAt: 0 });
	}

	unregister(id: string): void {
		this.jobs.delete(id);
	}

	getJitterMs(id: string): number {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		return Math.abs(hash) % this.maxJitterMs;
	}

	async tryRun(id: string): Promise<void> {
		const job = this.jobs.get(id);
		if (!job) throw new Error(`Job ${id} not registered`);
		const now = Date.now();
		if (now - job.lastRunAt < this.minIntervalMs) return;
		job.lastRunAt = now;
		await job.handler();
	}
}
