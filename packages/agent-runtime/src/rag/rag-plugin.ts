import type { RAGPlugin as IRAGPlugin, DocumentSource, RAGQuery, RAGResult } from "@ebsclaw/plugin-api";
import type { PluginContext } from "@ebsclaw/plugin-api";
import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";

export interface RAGPluginOpts {
	dataDir: string;
}

interface IndexedChunk {
	content: string;
	source: string;
}

function keywordScore(query: string, text: string): number {
	const qTokens = new Set(query.toLowerCase().split(/\s+/));
	const tTokens = new Set(text.toLowerCase().split(/\s+/));
	let overlap = 0;
	for (const t of qTokens) {
		if (tTokens.has(t)) overlap++;
	}
	return qTokens.size === 0 ? 0 : overlap / qTokens.size;
}

export class RAGPlugin implements IRAGPlugin {
	private dataDir: string;
	private chunks: IndexedChunk[] = [];
	private initPromise: Promise<void> | null = null;
	private initialized = false;
	private ctx: PluginContext | null = null;

	constructor(opts: RAGPluginOpts) {
		this.dataDir = opts.dataDir;
	}

	async init(ctx: PluginContext): Promise<void> {
		this.ctx = ctx;
		this.initialized = true;
	}

	async destroy(): Promise<void> {
		this.ctx = null;
		this.chunks = [];
		this.initialized = false;
	}

	async initMutex(): Promise<void> {
		if (this.initialized) return;
		if (!this.initPromise) {
			this.initPromise = (async () => {
				this.initialized = true;
			})();
		}
		return this.initPromise;
	}

	async indexDocuments(source: DocumentSource): Promise<void> {
		if (source.type !== "file") return;
		const dir = source.path;
		if (!existsSync(dir)) return;

		const patterns = source.filePatterns ?? ["*"];
		const entries = await readdir(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const s = await stat(fullPath);
			if (s.isDirectory() && source.recursive) {
				await this.indexDocuments({ ...source, path: fullPath });
				continue;
			}
			if (!s.isFile()) continue;
			const ext = extname(entry);
			const matches = patterns.some((p) => {
				if (p === "*") return true;
				if (p.startsWith("*.")) return ext === p.slice(1);
				return entry === p;
			});
			if (!matches) continue;

			const content = await readFile(fullPath, "utf-8");
			const lines = content.split("\n");
			const chunkSize = 10;
			for (let i = 0; i < lines.length; i += chunkSize) {
				this.chunks.push({
					content: lines.slice(i, i + chunkSize).join("\n"),
					source: fullPath,
				});
			}
		}
	}

	async query(req: RAGQuery): Promise<RAGResult> {
		const topK = req.topK ?? 5;
		const scored = this.chunks.map((chunk) => ({
			content: chunk.content,
			source: chunk.source,
			relevanceScore: keywordScore(req.query, chunk.content),
		}));
		scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
		return { chunks: scored.slice(0, topK) };
	}
}
