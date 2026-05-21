import type { EmbedRequest } from "../types.ts";

const PRIORITY_ORDER: Record<EmbedRequest["priority"], number> = {
	session_chat: 0,
	memory_search: 1,
	rag_indexing: 2,
};

export class EmbedQueue {
	private queue: EmbedRequest[] = [];
	private processing = false;
	private embedFn: ((text: string, model?: string) => Promise<number[]>) | null = null;

	setEmbedFn(fn: (text: string, model?: string) => Promise<number[]>): void {
		this.embedFn = fn;
	}

	startProcessing(): void {
		if (!this.processing) {
			this.processing = true;
		}
	}

	enqueue(req: EmbedRequest): void {
		this.queue.push(req);
		this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
	}

	async drain(): Promise<void> {
		while (this.queue.length > 0) {
			await this.processNext();
		}
	}

	private async processNext(): Promise<void> {
		if (this.queue.length === 0 || !this.embedFn) return;

		const req = this.queue.shift()!;
		try {
			const embedding = await this.embedFn(req.text);
			req.resolve(embedding);
		} catch (err) {
			req.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}
}
