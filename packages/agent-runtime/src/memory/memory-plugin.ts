import type { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import type { MemoryPlugin as IMemoryPlugin, MemoryEntry, MemoryQuery, MemoryResult } from "@ebsclaw/plugin-api";
import type { PluginContext } from "@ebsclaw/plugin-api";
import { keywordScore } from "@ebsclaw/shared";
import { AutoDream } from "./autodream.ts";
import { MemoryExtractor } from "./extract.ts";

export interface MemoryPluginOpts {
	store: MemoryStore;
	sessionDir?: string;
}

export class MemoryPlugin implements IMemoryPlugin {
	private memStore: MemoryStore;
	private ctx: PluginContext | null = null;
	private extractor: MemoryExtractor;
	private dream: AutoDream;

	constructor(opts: MemoryPluginOpts) {
		this.memStore = opts.store;
		this.extractor = new MemoryExtractor(opts.store, { sessionDir: opts.sessionDir });
		this.dream = new AutoDream(opts.store);
	}

	async init(ctx: PluginContext): Promise<void> {
		this.ctx = ctx;
		ctx.scheduleCron("0 3 * * *", async () => {
			await this.dream.run();
		});
	}

	async destroy(): Promise<void> {
		this.ctx = null;
	}

	async store(entry: MemoryEntry): Promise<void> {
		await this.memStore.create({
			content: entry.content,
			type: entry.type,
			scope: entry.scope,
		});
	}

	async query(req: MemoryQuery): Promise<MemoryResult> {
		const topK = req.topK ?? 5;
		const all = await this.memStore.list();
		const entries: MemoryResult["entries"] = [];

		for (const item of all) {
			const stem = item.filename.replace("memories/", "").replace(".md", "");
			const id = stem.includes("_mem_") ? stem.slice(stem.indexOf("mem_")) : stem;
			const full = await this.memStore.read(id);
			if (!full) continue;
			if (req.type && full.type !== req.type) continue;
			const score = keywordScore(req.text, full.content);
			entries.push({ content: full.content, type: full.type, relevanceScore: score });
		}

		entries.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
		return { entries: entries.slice(0, topK) };
	}

	async extractAndStore(sessionId: string): Promise<void> {
		void sessionId;
		await this.extractor.extract([]);
	}
}
