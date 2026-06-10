import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";
import OpenAI from "openai";

export interface OpenAIProviderDeps {
	chat?: { completions: { create: (params: any) => Promise<any> } };
	embeddings?: { create: (params: any) => Promise<any> };
}

export class OpenAIProvider {
	private client: OpenAI | null = null;
	private deps: OpenAIProviderDeps;

	constructor(
		private config: { apiKey: string; model: string; maxTokens: number; baseUrl?: string },
		deps?: OpenAIProviderDeps,
	) {
		this.deps = deps ?? {};
		if (!deps?.chat) {
			this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
		}
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const params = {
			model: req.model ?? this.config.model,
			max_tokens: req.maxTokens ?? this.config.maxTokens,
			messages: [
				...(req.systemPrompt ? [{ role: "system" as const, content: req.systemPrompt }] : []),
				{ role: "user" as const, content: req.prompt },
			],
			temperature: req.temperature,
		};

		const completion = this.deps.chat
			? await this.deps.chat.completions.create(params)
			: await this.client!.chat.completions.create(params, { signal });

		return {
			text: completion.choices[0]?.message?.content ?? "",
			model: completion.model,
			usage: completion.usage
				? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens }
				: undefined,
		};
	}

	async embed(text: string, model = "text-embedding-3-large"): Promise<number[]> {
		const params = { input: text, model };

		const result = this.deps.embeddings
			? await this.deps.embeddings.create(params)
			: await this.client!.embeddings.create(params);

		return result.data[0].embedding;
	}
}
