import type { LLMRequest, LLMResponse } from "@miniclaw/plugin-api";

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
	halfOpenAfterMs: number;
	successThreshold: number;
	failureThreshold: number;
}

export interface AgentMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	toolCalls?: ToolCall[];
	toolCallId?: string;
	timestamp: number;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: string;
}

export interface ToolResult {
	toolCallId: string;
	content: string;
	isError: boolean;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<string>;
}

export interface ToolExecutionContext {
	sessionId: string;
	workingDir: string;
	readOnly: boolean;
	enqueueReply: (content: string) => void;
	signal?: AbortSignal;
}

export interface LLMProviderConfig {
	name: string;
	type: "anthropic" | "openai" | "google" | "bedrock";
	model: string;
	apiKeyEnvVar: string;
	baseUrl?: string;
	maxTokens: number;
	priority: number;
}

export interface AssembledPrompt {
	systemPrompt: string;
	messages: AgentMessage[];
	estimatedTokens: number;
}

export interface CompactionResult {
	level: number;
	applied: boolean;
	tokensFreed: number;
	summary?: string;
}

export interface ToolSchema {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface StreamChunk {
	type: "text" | "tool_call" | "tool_result" | "done";
	content: string;
	toolCall?: ToolCall;
	toolResult?: ToolResult;
}

export interface EmbedRequest {
	id: string;
	text: string;
	priority: "session_chat" | "memory_search" | "rag_indexing";
	tenantId?: string;
	resolve: (embedding: number[]) => void;
	reject: (error: Error) => void;
}
