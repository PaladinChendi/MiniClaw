import type { LLMRequest, LLMResponse, LLMOptions } from "./llm";

export interface Plugin {
  init(ctx: PluginContext): Promise<void>;
  destroy(): Promise<void>;
}

export interface PluginConfig {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface PluginContext {
  logger: Logger;
  config: Readonly<PluginConfig>;
  callLLM(req: LLMRequest, opts?: LLMOptions): Promise<LLMResponse>;
  scheduleCron(spec: string, handler: () => Promise<void>): void;
}
