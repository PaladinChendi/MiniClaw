export interface EmbedEngineOpts {
	wasmEmbedFn?: (text: string) => Promise<number[]>;
	apiEmbedFn?: (text: string) => Promise<number[]>;
	dims?: number;
}

function hashVector(text: string, dims: number): number[] {
	const vec = new Array(dims).fill(0);
	for (let i = 0; i < text.length; i++) {
		vec[i % dims] += text.charCodeAt(i);
	}
	const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
	return vec.map((v) => v / norm);
}

export class EmbedEngine {
	private wasmEmbedFn: ((text: string) => Promise<number[]>) | null;
	private apiEmbedFn: ((text: string) => Promise<number[]>) | null;
	private dims: number;

	constructor(opts: EmbedEngineOpts) {
		this.wasmEmbedFn = opts.wasmEmbedFn ?? null;
		this.apiEmbedFn = opts.apiEmbedFn ?? null;
		this.dims = opts.dims ?? 64;
	}

	async embed(text: string): Promise<number[]> {
		if (this.wasmEmbedFn) {
			try {
				return await this.wasmEmbedFn(text);
			} catch {
				// fall through to API
			}
		}
		if (this.apiEmbedFn) {
			try {
				return await this.apiEmbedFn(text);
			} catch {
				// fall through to hash
			}
		}
		return hashVector(text, this.dims);
	}
}
