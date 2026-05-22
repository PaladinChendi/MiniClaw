import type { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import type { MemoryFileEntry } from "@ebsclaw/memory/types";

export interface AutoDreamResult {
	stages: string[];
	consolidated: number;
	pruned: number;
}

export interface AutoDreamOpts {
	consolidateFn?: (entries: string[]) => Promise<string>;
	pruneAge?: number;
}

export class AutoDream {
	private store: MemoryStore;
	private consolidateFn: (entries: string[]) => Promise<string>;
	private pruneAge: number;

	constructor(store: MemoryStore, opts?: AutoDreamOpts) {
		this.store = store;
		this.consolidateFn = opts?.consolidateFn ?? (async (entries) => entries.join("; "));
		this.pruneAge = opts?.pruneAge ?? Number.POSITIVE_INFINITY;
	}

	async orient(): Promise<{ entries: MemoryFileEntry[] }> {
		const index = await this.store.list();
		const entries: MemoryFileEntry[] = [];
		for (const item of index) {
			const stem = item.filename.replace("memories/", "").replace(".md", "");
			const id = stem.includes("_mem_") ? stem.slice(stem.indexOf("mem_")) : stem;
			const entry = await this.store.read(id);
			if (entry) entries.push(entry);
		}
		return { entries };
	}

	async gather(): Promise<string[]> {
		const { entries } = await this.orient();
		return entries.map((e) => e.content);
	}

	async consolidate(contents: string[]): Promise<number> {
		if (contents.length === 0) return 0;
		const merged = await this.consolidateFn(contents);
		await this.store.create({ content: merged, type: "user" });
		return 1;
	}

	async prune(): Promise<number> {
		if (this.pruneAge === Number.POSITIVE_INFINITY) return 0;
		const { entries } = await this.orient();
		const now = Date.now();
		let pruned = 0;
		for (const entry of entries) {
			if (now - entry.updatedAt >= this.pruneAge) {
				await this.store.delete(entry.id);
				pruned++;
			}
		}
		return pruned;
	}

	async run(): Promise<AutoDreamResult> {
		const stages: string[] = [];

		await this.orient();
		stages.push("orient");

		const contents = await this.gather();
		stages.push("gather");

		const consolidated = await this.consolidate(contents);
		stages.push("consolidate");

		const pruned = await this.prune();
		stages.push("prune");

		return { stages, consolidated, pruned };
	}
}
