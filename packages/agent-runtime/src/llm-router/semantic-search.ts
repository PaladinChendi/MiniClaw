import { hashVector } from "@ebsclaw/shared";

export interface SearchResult {
	id: string;
	text: string;
	score: number;
}

interface IndexedDoc {
	id: string;
	text: string;
	embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

export class SemanticSearch {
	private docs: Map<string, IndexedDoc> = new Map();
	private embedFn: ((text: string) => Promise<number[]>) | null = null;
	private rerankFn: ((query: string, candidates: SearchResult[]) => Promise<SearchResult[]>) | null = null;
	private embedDims = 64;

	setEmbedFn(fn: (text: string) => Promise<number[]>): void {
		this.embedFn = fn;
	}

	setRerankFn(fn: (query: string, candidates: SearchResult[]) => Promise<SearchResult[]>): void {
		this.rerankFn = fn;
	}

	async index(id: string, text: string): Promise<void> {
		const embedding = await this.embed(text);
		if (embedding.length > 0) this.embedDims = embedding.length;
		this.docs.set(id, { id, text, embedding });
	}

	removeFromIndex(id: string): void {
		this.docs.delete(id);
	}

	async search(query: string, opts: { topK?: number; rerank?: boolean } = {}): Promise<SearchResult[]> {
		const topK = opts.topK ?? 5;
		if (this.docs.size === 0) return [];

		const queryEmb = await this.embed(query);
		const candidates: SearchResult[] = [];

		for (const doc of this.docs.values()) {
			let score: number;
			if (queryEmb.length === doc.embedding.length && queryEmb.length > 0) {
				score = cosineSimilarity(queryEmb, doc.embedding);
			} else {
				score = cosineSimilarity(hashVector(query, this.embedDims), hashVector(doc.text, this.embedDims));
			}
			candidates.push({ id: doc.id, text: doc.text, score });
		}

		candidates.sort((a, b) => b.score - a.score);
		const top = candidates.slice(0, topK);

		if (opts.rerank && this.rerankFn) {
			return this.rerankFn(query, top);
		}
		return top;
	}

	private async embed(text: string): Promise<number[]> {
		if (this.embedFn) {
			try {
				return await this.embedFn(text);
			} catch {
				return hashVector(text, this.embedDims);
			}
		}
		return hashVector(text, this.embedDims);
	}
}
