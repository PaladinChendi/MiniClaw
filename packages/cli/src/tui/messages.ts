import type { ToolCall, ToolResult } from "@ebsclaw/agent-runtime";

// ── User messages ──

export interface UserTextMessage {
	type: "user_text";
	content: string;
}

export interface UserImageMessage {
	type: "user_image";
	alt: string;
}

export interface UserCommandMessage {
	type: "user_command";
	command: string;
	args?: string;
}

export interface UserBashMessage {
	type: "user_bash";
	command: string;
	output: string;
	exitCode: number;
}

export interface UserToolSuccessMessage {
	type: "user_tool_success";
	toolName: string;
	toolCallId: string;
	content: string;
}

export interface UserToolErrorMessage {
	type: "user_tool_error";
	toolName: string;
	toolCallId: string;
	content: string;
	errorType?: "rejected" | "classifier_rejected" | "interrupted";
}

export interface UserToolRejectMessage {
	type: "user_tool_reject";
	toolName: string;
	toolCallId: string;
	reason?: string;
}

export interface AttachmentMessage {
	type: "attachment";
	fileName: string;
	fileType: "image" | "file";
	size?: number;
}

export interface UserTeammateMessage {
	type: "user_teammate";
	agentName: string;
	content: string;
}

export interface UserPlanMessage {
	type: "user_plan";
	content: string;
}

export interface UserMemoryInputMessage {
	type: "user_memory_input";
	content: string;
}

// ── Assistant messages ──

export interface AssistantTextMessage {
	type: "assistant_text";
	content: string;
}

export interface AssistantThinkingMessage {
	type: "assistant_thinking";
	content: string;
	expanded?: boolean;
}

export interface AssistantRedactedThinkingMessage {
	type: "assistant_redacted_thinking";
}

export type ToolUseStatus = "running" | "done" | "error";

export interface AssistantToolUseMessage {
	type: "assistant_tool_use";
	toolCall: ToolCall;
	status: ToolUseStatus;
	result?: ToolResult;
	label?: string;
}

// ── System messages ──

export interface SystemTextMessage {
	type: "system_text";
	content: string;
}

export interface CompactBoundaryMessage {
	type: "compact_boundary";
}

export interface CompactSummaryMessage {
	type: "compact_summary";
	content: string;
	expanded?: boolean;
}

// ── Union types ──

export type UserMessage =
	| UserTextMessage
	| UserImageMessage
	| UserCommandMessage
	| UserBashMessage
	| UserToolSuccessMessage
	| UserToolErrorMessage
	| UserToolRejectMessage
	| AttachmentMessage
	| UserTeammateMessage
	| UserPlanMessage
	| UserMemoryInputMessage;

export type AssistantMessage =
	| AssistantTextMessage
	| AssistantThinkingMessage
	| AssistantRedactedThinkingMessage
	| AssistantToolUseMessage;

export type SystemMessage = SystemTextMessage | CompactBoundaryMessage | CompactSummaryMessage;

export type RichMessage = UserMessage | AssistantMessage | SystemMessage;
