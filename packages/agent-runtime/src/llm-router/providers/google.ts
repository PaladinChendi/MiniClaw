import type { LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";

export class GoogleProvider {
	constructor(private config: { apiKey: string; model: string; maxTokens: number }) {}

	async chat(_req: LLMRequest, _signal?: AbortSignal): Promise<LLMResponse> {
		throw new Error("Google provider not yet implemented — use Anthropic or OpenAI in v1");
	}

	async embed(_text: string, _model?: string): Promise<number[]> {
		throw new Error("Google embed not yet implemented — use OpenAI for embeddings in v1");
	}
}
