import type { StreamChunk } from "./types.ts";

export interface StreamingEngineConfig {
	chunkSize?: number;
	maxBuffer?: number;
}

const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/;

export class StreamingEngine {
	private buffer = "";
	private chunkSize: number;
	private maxBuffer: number;
	private onChunkFn: ((text: string) => void) | null = null;
	private onRawChunkFn: ((chunk: StreamChunk) => void) | null = null;
	private resolveFinish: (() => void) | null = null;
	private finishedPromise: Promise<void>;

	constructor(config: StreamingEngineConfig = {}) {
		this.chunkSize = config.chunkSize ?? 200;
		this.maxBuffer = config.maxBuffer ?? 1024 * 1024;
		this.finishedPromise = new Promise<void>((resolve) => {
			this.resolveFinish = resolve;
		});
	}

	onChunk(fn: (text: string) => void): void {
		this.onChunkFn = fn;
	}

	onRawChunk(fn: (chunk: StreamChunk) => void): void {
		this.onRawChunkFn = fn;
	}

	push(chunk: StreamChunk): boolean {
		if (chunk.type === "tool_call" || chunk.type === "tool_result" || chunk.type === "done") {
			this.onRawChunkFn?.(chunk);
			return false;
		}

		this.buffer += chunk.content;
		this.onRawChunkFn?.(chunk);

		const overflow = this.buffer.length > this.maxBuffer;

		while (this.buffer.length >= this.chunkSize) {
			const sentences = this.buffer.split(SENTENCE_BOUNDARY);
			if (sentences.length > 1) {
				const toEmit = sentences.slice(0, -1).join(" ");
				this.buffer = sentences[sentences.length - 1];
				this.onChunkFn?.(toEmit);
			} else {
				break;
			}
		}

		return overflow;
	}

	end(): void {
		if (this.buffer.length > 0) {
			this.onChunkFn?.(this.buffer);
			this.buffer = "";
		}
		this.onRawChunkFn?.({ type: "done", content: "" });
		this.resolveFinish?.();
	}

	finished(): Promise<void> {
		return this.finishedPromise;
	}

	fallBackToNonStreaming(): string {
		const text = this.buffer;
		this.buffer = "";
		return text;
	}

	reset(): void {
		this.buffer = "";
		this.finishedPromise = new Promise<void>((resolve) => {
			this.resolveFinish = resolve;
		});
	}
}
