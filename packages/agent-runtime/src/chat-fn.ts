import type { AgentMessage, ToolSchema } from "./types.ts";

export interface ChatFnConfig {
	provider: "anthropic" | "openai" | "kcode" | "custom";
	apiKey: string;
	baseUrl?: string;
	model: string;
}

export function toAnthropicApiMsgs(msgs: AgentMessage[]): any[] {
	const filtered = msgs.filter((m) => m.role !== "system");
	const result: any[] = [];
	for (const m of filtered) {
		if (m.role === "tool" && m.toolCallId) {
			const last = result[result.length - 1];
			if (last?.role === "user" && Array.isArray(last.content)) {
				last.content.push({ type: "tool_result", tool_use_id: m.toolCallId, content: m.content });
			} else {
				result.push({
					role: "user",
					content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
				});
			}
		} else if (m.role === "assistant" && m.toolCalls?.length) {
			const content: any[] = [];
			if (m.content) content.push({ type: "text", text: m.content });
			for (const tc of m.toolCalls) {
				content.push({ type: "tool_use", id: tc.id, name: tc.name, input: JSON.parse(tc.arguments) });
			}
			result.push({ role: "assistant", content });
		} else {
			result.push({ role: m.role as "user" | "assistant", content: m.content });
		}
	}
	return result;
}

export async function buildChatFn(
	config: ChatFnConfig,
): Promise<(messages: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => Promise<AgentMessage>> {
	const apiKey = config.apiKey;
	const baseUrl = config.baseUrl || undefined;
	const model = config.model;

	if (config.provider === "anthropic") {
		const { default: Anthropic } = await import("@anthropic-ai/sdk");
		const client = new Anthropic({ apiKey, baseURL: baseUrl });
		return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const apiMsgs = toAnthropicApiMsgs(msgs);
			const apiTools = tools?.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: { type: "object" as const, ...t.parameters },
			}));
			const res = await client.messages.create(
				{
					model,
					max_tokens: 4096,
					messages: apiMsgs,
					...(system ? { system } : {}),
					...(apiTools?.length ? { tools: apiTools } : {}),
				},
				signal ? { signal } : {},
			);
			const textBlock = res.content.find((b: any) => b.type === "text");
			const toolUseBlocks = res.content.filter((b: any) => b.type === "tool_use");
			return {
				role: "assistant" as const,
				content: (textBlock as any)?.text ?? "",
				toolCalls: toolUseBlocks.map((b: any) => ({
					id: b.id,
					name: b.name,
					arguments: JSON.stringify(b.input),
				})),
				timestamp: Date.now(),
			};
		};
	}

	if (config.provider === "kcode") {
		const endpoint = `${(baseUrl || "").replace(/\/$/, "")}/messages`;
		return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
			const system = msgs.find((m) => m.role === "system")?.content;
			const apiMsgs = toAnthropicApiMsgs(msgs);
			const apiTools = tools?.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: { type: "object" as const, ...t.parameters },
			}));
			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"ksyun-code-type": "kscc-cli",
				},
				body: JSON.stringify({
					model,
					max_tokens: 4096,
					messages: apiMsgs,
					...(system ? { system } : {}),
					...(apiTools?.length ? { tools: apiTools } : {}),
				}),
				signal,
			});
			if (!res.ok) {
				const err = await res.text();
				throw new Error(`${res.status} ${err}`);
			}
			const data = (await res.json()) as any;
			const textBlock = data.content?.find((b: any) => b.type === "text");
			const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === "tool_use");
			return {
				role: "assistant" as const,
				content: (textBlock as any)?.text ?? "",
				toolCalls: toolUseBlocks.map((b: any) => ({
					id: b.id,
					name: b.name,
					arguments: JSON.stringify(b.input),
				})),
				timestamp: Date.now(),
			};
		};
	}

	// OpenAI-compatible (openai, deepseek, custom, etc.)
	const { default: OpenAI } = await import("openai");
	const client = new OpenAI({ apiKey, baseURL: baseUrl });
	return async (msgs: AgentMessage[], tools?: ToolSchema[], signal?: AbortSignal) => {
		const apiMsgs: any[] = msgs.map((m) => {
			if (m.role === "tool" && m.toolCallId) {
				return { role: "tool" as const, content: m.content, tool_call_id: m.toolCallId };
			}
			if (m.role === "assistant" && m.toolCalls?.length) {
				return {
					role: "assistant" as const,
					content: m.content || null,
					tool_calls: m.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: { name: tc.name, arguments: tc.arguments },
					})),
				};
			}
			return { role: m.role as "system" | "user" | "assistant", content: m.content };
		});
		const apiTools = tools?.map((t) => ({
			type: "function" as const,
			function: { name: t.name, description: t.description, parameters: t.parameters },
		}));
		const res = await client.chat.completions.create(
			{
				model,
				messages: apiMsgs,
				...(apiTools?.length ? { tools: apiTools } : {}),
			},
			signal ? { signal } : {},
		);
		const choice = res.choices[0];
		return {
			role: "assistant" as const,
			content: choice?.message?.content ?? "",
			toolCalls: (choice?.message?.tool_calls ?? []).map((tc: any) => ({
				id: tc.id,
				name: tc.function.name,
				arguments: tc.function.arguments,
			})),
			timestamp: Date.now(),
		};
	};
}
