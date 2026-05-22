import type { LLMOptions, LLMRequest, LLMResponse } from "./llm";

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

export interface MemoryStoreHandle {
	read(id: string): Promise<import("./memory").MemoryEntry | null>;
	list(): Promise<Array<{ filename: string; name: string; description: string; type: string }>>;
}

export interface PluginContext {
	logger: Logger;
	config: Readonly<PluginConfig>;
	callLLM(req: LLMRequest, opts?: LLMOptions): Promise<LLMResponse>;
	scheduleCron(spec: string, handler: () => Promise<void>): void;
	callPlugin(pluginName: string, method: string, args: Record<string, unknown>): Promise<unknown>;
	getStore(): MemoryStoreHandle;
}
