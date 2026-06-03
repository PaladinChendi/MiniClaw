import type { ToolCall, ToolResult } from "@ebsclaw/plugin-api";

// Client → Server
export interface WSInbound {
	type: "chat.send";
	sessionId: string;
	content: string;
}

// Server → Client
export interface WSOutbound {
	type: "chat.stream" | "chat.tool_call" | "chat.tool_result" | "chat.error" | "chat.done";
	sessionId: string;
	content?: string;
	toolCall?: ToolCall;
	toolResult?: ToolResult;
}

export function parseWSMessage(raw: string | ArrayBuffer): WSInbound | null {
	try {
		const str = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
		const parsed = JSON.parse(str);
		if (parsed && parsed.type === "chat.send" && parsed.sessionId && parsed.content) {
			return parsed as WSInbound;
		}
	} catch {
		// ignore malformed messages
	}
	return null;
}

export function formatWSMessage(out: WSOutbound): string {
	return JSON.stringify(out);
}
