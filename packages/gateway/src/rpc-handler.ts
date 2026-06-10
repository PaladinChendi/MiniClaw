import type { AgentMessage } from "@miniclaw/agent-runtime";

export interface AgentRunRequest {
	sessionId?: string;
	messages: AgentMessage[];
	systemPrompt?: string;
	readOnly?: boolean;
	workingDir?: string;
}

export interface AgentRunResponse {
	sessionId: string;
	messages: AgentMessage[];
	tokenCount: number;
}

export async function handleAgentRun(
	req: Request,
	dispatch: (request: AgentRunRequest) => Promise<AgentRunResponse>,
): Promise<Response> {
	try {
		const body = (await req.json()) as AgentRunRequest;
		if (!body.messages || !Array.isArray(body.messages)) {
			return new Response(JSON.stringify({ error: "messages array required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		const result = await dispatch(body);
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
