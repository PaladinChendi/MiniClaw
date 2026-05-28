import type { LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";

export interface ProviderLike {
	name: string;
	chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>;
	embed(text: string, model?: string): Promise<number[]>;
}

export class FallbackChain {
	private _providers: ProviderLike[];

	constructor(providers: ProviderLike[]) {
		this._providers = [...providers];
	}

	get providers(): ProviderLike[] {
		return [...this._providers];
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const errors: Error[] = [];
		for (const provider of this._providers) {
			try {
				return await provider.chat(req, signal);
			} catch (err) {
				errors.push(err instanceof Error ? err : new Error(String(err)));
			}
		}
		throw new Error(`All providers failed: ${errors.map((e) => e.message).join("; ")}`);
	}

	async embed(text: string, model?: string): Promise<number[]> {
		const errors: Error[] = [];
		for (const provider of this._providers) {
			try {
				return await provider.embed(text, model);
			} catch (err) {
				errors.push(err instanceof Error ? err : new Error(String(err)));
			}
		}
		throw new Error(`All providers failed for embed: ${errors.map((e) => e.message).join("; ")}`);
	}

	hotSwap(name: string, replacement: ProviderLike): void {
		const idx = this._providers.findIndex((p) => p.name === name);
		if (idx !== -1) {
			this._providers[idx] = replacement;
		}
	}
}
