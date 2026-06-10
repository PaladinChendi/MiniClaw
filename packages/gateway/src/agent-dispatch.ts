import type { AgentMessage, ToolSchema } from "@miniclaw/agent-runtime";
import type { Gateway } from "./index.ts";
import type { WSOutbound } from "./ws-protocol.ts";
import type { AgentRunRequest, AgentRunResponse } from "./rpc-handler.ts";

const runtimeCache = new Map<string, any>(); // AgentRuntime instances
const sharedToolDefs: any[] = []; // cached tool definitions

function estimateTokens(messages: AgentMessage[]): number {
	return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
}

export async function dispatchInboundMessage(
	gateway: Gateway,
	sessionId: string,
	content: string,
	sendBack: (msg: WSOutbound) => void,
): Promise<void> {
	await gateway.ingress({
		id: crypto.randomUUID(),
		channelId: sessionId,
		userId: "ws-user",
		content,
		timestamp: Date.now(),
	});

	let messages = gateway.activeConversations.get(sessionId) ?? [];
	messages.push({ role: "user", content, timestamp: Date.now() });

	try {
		const result = await runEmbeddedPiAgent(gateway, sessionId, messages, sendBack);
		gateway.activeConversations.set(sessionId, result);
		await gateway.sessionManager.updateMessages(sessionId, result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		sendBack({ type: "chat.error", sessionId, content: msg });
	}
}

export async function dispatchAgentRunFromGateway(
	gateway: Gateway,
	request: AgentRunRequest,
): Promise<AgentRunResponse> {
	const sessionId = request.sessionId ?? crypto.randomUUID();
	const messages = request.messages;

	const result = await runEmbeddedPiAgent(gateway, sessionId, messages, undefined);

	await gateway.sessionManager.updateMessages(sessionId, result);
	return { sessionId, messages: result, tokenCount: estimateTokens(result) };
}

async function runEmbeddedPiAgent(
	gateway: Gateway,
	sessionId: string,
	messages: AgentMessage[],
	sendBack?: (msg: WSOutbound) => void,
): Promise<AgentMessage[]> {
	const chatFn = gateway.chatFn;
	if (!chatFn) throw new Error("chatFn not set — call gateway.setChatFn() before starting");

	let runtime = runtimeCache.get(sessionId);
	if (!runtime) {
		const { AgentRuntime: AR, BashTool, ReadFileTool, ListFilesTool } = await import("@miniclaw/agent-runtime");

		if (sharedToolDefs.length === 0) {
			sharedToolDefs.push(new BashTool().definition, new ReadFileTool().definition, new ListFilesTool().definition);
		}

		runtime = new AR({
			chatFn,
			baseSystemPrompt:
				"You are miniclaw, a helpful AI assistant. You have tools: bash (execute commands), read_file (read file contents), list_files (list directory contents).\n\nRules:\n1. Use tools when the user asks about files or system operations.\n2. After receiving tool results, ALWAYS respond with a text summary of the outcome. Do NOT make additional tool calls unless the user's request genuinely requires more actions.\n3. If a tool call fails, explain the error and suggest alternatives — do not retry the same command.",
			tools: sharedToolDefs,
			workingDir: process.cwd(),
		});

		if (sendBack) {
			runtime.onStreamChunk((text: string) =>
				sendBack({ type: "chat.stream", sessionId, content: text }),
			);
			runtime.onToolCallStart((call: any, text: string) => {
				if (text.trim()) sendBack({ type: "chat.stream", sessionId, content: text });
				sendBack({ type: "chat.tool_call", sessionId, toolCall: call });
			});
			runtime.onToolCall((call: any, result: any) =>
				sendBack({ type: "chat.tool_result", sessionId, toolResult: result }),
			);
			runtime.onReply((text: string) =>
				sendBack({ type: "chat.done", sessionId, content: text }),
			);
		}

		runtimeCache.set(sessionId, runtime);
	}

	return runtime.run(messages);
}
