import type { LLMOptions, LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";
import { CircuitBreaker } from "../circuit-breaker.ts";
import type { EmbedRequest, LLMProviderConfig } from "../types.ts";
import { EmbedQueue } from "./embed-queue.ts";
import { FallbackChain } from "./fallback-chain.ts";
import type { ProviderLike } from "./fallback-chain.ts";
import { AnthropicProvider } from "./providers/anthropic.ts";
import { OpenAIProvider } from "./providers/openai.ts";

export class LLMRouter {
	private chain: FallbackChain;
	private breakers: Map<string, CircuitBreaker> = new Map();
	private embedQueue: EmbedQueue;

	constructor(providerConfigs: LLMProviderConfig[]) {
		const providers: ProviderLike[] = providerConfigs
			.sort((a, b) => a.priority - b.priority)
			.map((cfg) => {
				this.breakers.set(cfg.name, new CircuitBreaker());
				return this.createProvider(cfg);
			});
		this.chain = new FallbackChain(providers);
		this.embedQueue = new EmbedQueue();
	}

	async chat(req: LLMRequest, opts?: LLMOptions): Promise<LLMResponse> {
		for (const provider of this.chain.providers) {
			const breaker = this.breakers.get(provider.name);
			if (breaker && !breaker.allowRequest()) continue;
			try {
				const res = await provider.chat(req, opts?.signal);
				breaker?.recordSuccess();
				return res;
			} catch (err) {
				breaker?.recordFailure();
			}
		}
		throw new Error("All LLM providers unavailable — circuit breakers open or all failed");
	}

	async embed(
		text: string,
		priority: EmbedRequest["priority"] = "memory_search",
		model?: string,
		tenantId?: string,
	): Promise<number[]> {
		return new Promise<number[]>((resolve, reject) => {
			this.embedQueue.enqueue({
				id: crypto.randomUUID(),
				text,
				priority,
				tenantId,
				resolve,
				reject,
			});
		});
	}

	hotSwapProvider(name: string, newConfig: LLMProviderConfig): void {
		const replacement = this.createProvider(newConfig);
		this.chain.hotSwap(name, replacement);
		this.breakers.set(newConfig.name, new CircuitBreaker());
	}

	private createProvider(cfg: LLMProviderConfig): ProviderLike {
		const apiKey = process.env[cfg.apiKeyEnvVar] ?? "";
		switch (cfg.type) {
			case "anthropic": {
				const provider = new AnthropicProvider({ apiKey, model: cfg.model, maxTokens: cfg.maxTokens });
				return {
					name: cfg.name,
					chat: (req, signal) => provider.chat(req, signal),
					embed: (text, model) => provider.embed(text, model),
				};
			}
			case "openai": {
				const provider = new OpenAIProvider({ apiKey, model: cfg.model, maxTokens: cfg.maxTokens });
				return {
					name: cfg.name,
					chat: (req, signal) => provider.chat(req, signal),
					embed: (text, model) => provider.embed(text, model),
				};
			}
			default:
				throw new Error(`Unknown provider type: ${cfg.type}`);
		}
	}
}
