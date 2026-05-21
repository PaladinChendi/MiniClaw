import type { CronEntry } from "./types.ts";

export interface CronRegisterOptions {
	jitterMs: number;
	minIntervalMs: number;
	pluginName: string;
}

export class CronScheduler {
	private entries: Map<string, CronEntry> = new Map();

	computeJitter(id: string, jitterMs: number): number {
		if (jitterMs <= 0) return 0;
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
		}
		return Math.abs(hash % jitterMs);
	}

	register(id: string, spec: string, handler: () => Promise<void>, opts: CronRegisterOptions): void {
		const entry: CronEntry = {
			id,
			spec,
			handler,
			jitterMs: opts.jitterMs,
			minIntervalMs: opts.minIntervalMs,
			lastRunAt: null,
			pluginName: opts.pluginName,
		};
		this.entries.set(id, entry);
	}

	unregister(id: string): void {
		this.entries.delete(id);
	}

	list(): CronEntry[] {
		return Array.from(this.entries.values());
	}

	async tryRun(id: string): Promise<boolean> {
		const entry = this.entries.get(id);
		if (!entry) return false;

		if (entry.minIntervalMs > 0 && entry.lastRunAt !== null) {
			const elapsed = Date.now() - entry.lastRunAt;
			if (elapsed < entry.minIntervalMs) {
				return false;
			}
		}

		const jitter = this.computeJitter(id, entry.jitterMs);
		await new Promise((r) => setTimeout(r, jitter));

		await entry.handler();
		entry.lastRunAt = Date.now();
		return true;
	}
}
