import type { Gateway } from "./index.ts";
import type { GatewayConfig, LoadedPlugin } from "./types.ts";
import { parseWSMessage, formatWSMessage, type WSInbound, type WSOutbound } from "./ws-protocol.ts";
import { handleAgentRun, type AgentRunRequest, type AgentRunResponse } from "./rpc-handler.ts";
import { HeartbeatSystem } from "./heartbeat.ts";

type BunServer = ReturnType<typeof Bun.serve>;

export class GatewayServer {
	private gateway: Gateway;
	private config: GatewayConfig;
	private server: BunServer | null = null;
	private cronInterval: ReturnType<typeof setInterval> | null = null;
	private heartbeat: HeartbeatSystem;
	private shuttingDown = false;

	constructor(gateway: Gateway, config: GatewayConfig) {
		this.gateway = gateway;
		this.config = config;
		this.heartbeat = new HeartbeatSystem();
	}

	async start(): Promise<void> {
		const gw = this.gateway;
		const heartbeat = this.heartbeat;

		// Default health check: server is up
		heartbeat.register("server", async () => true);

		// Signal handlers
		const gracefulShutdown = async () => {
			if (this.shuttingDown) return;
			this.shuttingDown = true;
			process.stderr.write("\nShutting down...\n");
			await this.stop();
			process.exit(0);
		};
		process.on("SIGINT", gracefulShutdown);
		process.on("SIGTERM", gracefulShutdown);
		process.on("SIGUSR1", () => {
			process.stderr.write("SIGUSR1 received — hot reload not yet implemented\n");
		});

		this.server = Bun.serve({
			port: this.config.gateway.port,
			fetch(req, server) {
				const url = new URL(req.url);

				// WebSocket upgrade
				if (url.pathname === "/ws") {
					if (server.upgrade(req, { data: { connectedAt: Date.now() } })) return;
					return new Response("WebSocket upgrade failed", { status: 500 });
				}

				// RPC: POST /api/agent/run
				if (url.pathname === "/api/agent/run" && req.method === "POST") {
					return handleAgentRun(req, (request: AgentRunRequest) =>
						gw.dispatchAgentRunFromGateway(request),
					);
				}

				// Health check
				if (url.pathname === "/api/health") {
					return heartbeat.isAlive().then((alive) =>
						new Response(alive ? "ok" : "degraded", {
							status: alive ? 200 : 503,
						}),
					);
				}

				return new Response("Not Found", { status: 404 });
			},
			websocket: {
				open(ws) {
					ws.subscribe("broadcast");
				},
				async message(ws, msg) {
					const parsed = parseWSMessage(msg as string | ArrayBuffer);
					if (!parsed) {
						ws.send(formatWSMessage({ type: "chat.error", sessionId: "", content: "Invalid message format" }));
						return;
					}
					const sendBack = (out: WSOutbound) => ws.send(formatWSMessage(out));
					await gw.dispatchInboundMessage(parsed.sessionId, parsed.content, sendBack);
				},
				close(ws) {
					ws.unsubscribe("broadcast");
				},
			},
		});

		// Cron scheduler tick every 60s
		this.cronInterval = setInterval(() => {
			for (const entry of gw.cronScheduler.list()) {
				gw.cronScheduler.tryRun(entry.id).catch(() => {});
			}
		}, 60_000);

		process.stderr.write(`Gateway server listening on port ${this.config.gateway.port}\n`);
	}

	async stop(): Promise<void> {
		if (this.cronInterval) clearInterval(this.cronInterval);
		this.cronInterval = null;
		if (this.server) {
			this.server.stop();
			this.server = null;
		}
		await this.gateway.stop();
	}
}
