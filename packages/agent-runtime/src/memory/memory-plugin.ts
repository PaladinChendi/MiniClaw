import type { MemoryPlugin as IMemoryPlugin, MemoryEntry, MemoryQuery, MemoryResult } from "@ebsclaw/plugin-api";
import type { PluginContext } from "@ebsclaw/plugin-api";
import type { MemoryStore } from "@ebsclaw/gateway/src/memory-store";

export interface MemoryPluginOpts {
	store: MemoryStore;
}

function simpleScore(query: string, text: string): number {
	const qTokens = new Set(query.toLowerCase().split(/\s+/));
	const tTokens = new Set(text.toLowerCase().split(/\s+/));
	let overlap = 0;
	for (const t of qTokens) {
		if (tTokens.has(t)) overlap++;
	}
	return qTokens.size === 0 ? 0 : overlap / qTokens.size;
}

export class MemoryPlugin implements IMemoryPlugin {
	private memStore: MemoryStore;
	private ctx: PluginContext | null = null;

	constructor(opts: MemoryPluginOpts) {
		this.memStore = opts.store;
	}

	async init(ctx: PluginContext): Promise<void> {
		this.ctx = ctx;
		ctx.scheduleCron("0 3 * * *", async () => {
			// Auto-dream would run here in production
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
			const full = await this.memStore.read(item.filename.replace("memories/", "").replace(".md", ""));
			if (!full) continue;
			if (req.type && full.type !== req.type) continue;
			const score = simpleScore(req.text, full.content);
			entries.push({ content: full.content, type: full.type, relevanceScore: score });
		}

		entries.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
		return { entries: entries.slice(0, topK) };
	}

	async extractAndStore(sessionId: string): Promise<void> {
		// In production, this would extract from session messages
		// For now, it's a no-op that accepts the session ID
		void sessionId;
	}
}
