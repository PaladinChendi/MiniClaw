export interface LLMRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMOptions {
  signal?: AbortSignal;
  /** @internal v2 multi-tenant — do not use in v1 */
  tenantId?: string;
}
