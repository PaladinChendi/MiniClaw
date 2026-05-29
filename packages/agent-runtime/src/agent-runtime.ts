import { CompactionPipeline } from "./compaction/pipeline.ts";
import type { CompactionPipelineDeps } from "./compaction/pipeline.ts";
import type { CompactionConfig } from "./compaction/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "./compaction/types.ts";
import { PromptAssembler } from "./prompt-assembly.ts";
import type { MemoryEntry, ToolDef } from "./prompt-assembly.ts";
import { StreamingEngine } from "./streaming-engine.ts";
import { ToolRegistry } from "./tool-execution.ts";
import type {
	AgentMessage,
	CompactionResult,
	ToolCall,
	ToolDefinition,
	ToolExecutionContext,
	ToolResult,
	ToolSchema,
} from "./types.ts";

export interface AgentRuntimeConfig {
	chatFn: (messages: AgentMessage[], tools?: ToolSchema[]) => Promise<AgentMessage>;
	baseSystemPrompt: string;
	tools?: ToolDefinition[];
	compactionConfig?: Partial<CompactionConfig>;
	compactFn?: (messages: AgentMessage[]) => Promise<CompactionResult>;
	maxIterations?: number;
	workingDir?: string;
	readOnly?: boolean;
}

export class AgentRuntime {
	private chatFn: AgentRuntimeConfig["chatFn"];
	private promptAssembler: PromptAssembler;
	private toolRegistry: ToolRegistry;
	private streamingEngine: StreamingEngine;
	private compactionConfig: CompactionConfig;
	private compactFn?: AgentRuntimeConfig["compactFn"];
	private maxIterations: number;
	private workingDir: string;
	private readOnly: boolean;
	private sessionId: string;
	private onReplyFn: ((text: string) => void) | null = null;
	private onStreamChunkFn: ((text: string) => void) | null = null;
	private onToolCallFn: ((call: ToolCall, result: ToolResult) => void) | null = null;

	constructor(config: AgentRuntimeConfig) {
		this.chatFn = config.chatFn;
		this.promptAssembler = new PromptAssembler({
			baseSystemPrompt: config.baseSystemPrompt,
			maxTokens: config.compactionConfig?.maxTokens ?? DEFAULT_COMPACTION_CONFIG.maxTokens,
		});
		this.toolRegistry = new ToolRegistry();
		for (const tool of config.tools ?? []) {
			this.toolRegistry.register(tool);
		}
		this.streamingEngine = new StreamingEngine();
		this.compactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...config.compactionConfig };
		this.compactFn = config.compactFn;
		this.maxIterations = config.maxIterations ?? 10;
		this.workingDir = config.workingDir ?? "/tmp";
		this.readOnly = config.readOnly ?? false;
		this.sessionId = crypto.randomUUID();
	}

	onReply(fn: (text: string) => void): void {
		this.onReplyFn = fn;
	}

	onStreamChunk(fn: (text: string) => void): void {
		this.onStreamChunkFn = fn;
		this.streamingEngine.onChunk(fn);
	}

	onToolCall(fn: (call: ToolCall, result: ToolResult) => void): void {
		this.onToolCallFn = fn;
	}

	async run(messages: AgentMessage[], options?: { signal?: AbortSignal }): Promise<AgentMessage[]> {
		let currentMessages = [...messages];

		for (let i = 0; i < this.maxIterations; i++) {
			if (options?.signal?.aborted) {
				throw new Error("Aborted");
			}

			currentMessages = await this.maybeCompact(currentMessages);

			const toolDefs: ToolDef[] = this.toolRegistry.getDefinitions().map((d) => ({
				name: d.name,
				description: d.description,
				parameters: d.parameters,
			}));

			const assembled = this.promptAssembler.assemble(currentMessages, toolDefs, []);

			const llmMessages: AgentMessage[] = [
				{ role: "system", content: assembled.systemPrompt, timestamp: Date.now() },
				...assembled.messages,
			];

			const toolSchemas: ToolSchema[] = toolDefs.map((d) => ({
				name: d.name,
				description: d.description,
				parameters: d.parameters,
			}));

			const response = await this.chatFn(llmMessages, toolSchemas);

			this.onReplyFn?.(response.content);
			this.streamingEngine.push({ type: "text", content: response.content });

			currentMessages.push(response);

			if (!response.toolCalls || response.toolCalls.length === 0) {
				this.streamingEngine.push({ type: "done", content: "" });
				this.streamingEngine.end();
				return currentMessages;
			}

			for (const call of response.toolCalls) {
				if (options?.signal?.aborted) {
					throw new Error("Aborted");
				}

				this.streamingEngine.push({ type: "tool_call", content: call.name, toolCall: call });

				const ctx: ToolExecutionContext = {
					sessionId: this.sessionId,
					workingDir: this.workingDir,
					readOnly: this.readOnly,
					enqueueReply: (content: string) => {
						this.onReplyFn?.(content);
					},
				};

				let resultContent: string;
				let isError = false;
				try {
					const args = JSON.parse(call.arguments);
					resultContent = await this.toolRegistry.execute(call.name, args, ctx);
				} catch (err) {
					resultContent = String(err instanceof Error ? err.message : err);
					isError = true;
				}

				const toolResult: ToolResult = { toolCallId: call.id, content: resultContent, isError };
				this.onToolCallFn?.(call, toolResult);
				this.streamingEngine.push({ type: "tool_result", content: resultContent, toolResult });

				currentMessages.push({
					role: "tool",
					content: resultContent,
					toolCallId: call.id,
					timestamp: Date.now(),
				});
			}
		}

		this.streamingEngine.push({ type: "done", content: "" });
		this.streamingEngine.end();
		return currentMessages;
	}

	private async maybeCompact(messages: AgentMessage[]): Promise<AgentMessage[]> {
		const tokens = this.estimateTokens(messages);
		if (tokens <= this.compactionConfig.maxTokens) return messages;

		if (this.compactFn) {
			const result = await this.compactFn(messages);
			if (result.applied && result.summary) {
				return [{ role: "system", content: result.summary, timestamp: Date.now() }, ...messages.slice(-1)];
			}
			return messages;
		}

		return messages;
	}

	private estimateTokens(messages: AgentMessage[]): number {
		return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
	}
}
