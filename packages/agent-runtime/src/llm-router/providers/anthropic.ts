import Anthropic from "@anthropic-ai/sdk";
import type { LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";

export interface AnthropicProviderDeps {
	messages?: {
		create: (params: Anthropic.MessageCreateParams) => Promise<Anthropic.Message>;
	};
}

export class AnthropicProvider {
	private client: Anthropic | null = null;
	private deps: AnthropicProviderDeps;
	public _mockEmbed?: (input: string, model: string) => Promise<{ data: Array<{ embedding: number[] }> }>;

	constructor(
		private config: { apiKey: string; model: string; maxTokens: number; baseUrl?: string },
		deps?: AnthropicProviderDeps,
	) {
		this.deps = deps ?? {};
		if (!deps?.messages) {
			this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
		}
	}

	async chat(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
		const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.prompt }];

		const params: Anthropic.MessageCreateParams = {
			model: req.model ?? this.config.model,
			max_tokens: req.maxTokens ?? this.config.maxTokens,
			messages,
			system: req.systemPrompt ?? undefined,
			temperature: req.temperature,
		};

		const msg = this.deps.messages
			? await this.deps.messages.create(params)
			: await this.client!.messages.create(params, { signal });

		const textBlock = msg.content.find((b) => b.type === "text");
		return {
			text: textBlock?.type === "text" ? textBlock.text : "",
			model: msg.model,
			usage: msg.usage
				? { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }
				: undefined,
		};
	}

	async embed(text: string, model = "text-embedding-3-large"): Promise<number[]> {
		if (this._mockEmbed) {
			const res = await this._mockEmbed(text, model);
			return res.data[0].embedding;
		}
		throw new Error("Anthropic does not provide a native embed endpoint; use OpenAI or Google for embeddings");
	}
}
