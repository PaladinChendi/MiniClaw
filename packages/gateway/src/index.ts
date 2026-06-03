import type { LLMRequest, LLMResponse, Plugin, PluginContext, PluginManifest } from "@ebsclaw/plugin-api";
import type { AgentMessage } from "@ebsclaw/agent-runtime";
import { createStructuredLogger, hashVector } from "@ebsclaw/shared";
import { CronScheduler } from "./cron-scheduler.ts";
import { HeartbeatSystem } from "./heartbeat.ts";
import { HookEngine } from "./hook-engine.ts";
import { MemoryStoreHandle } from "./memory-store-handle.ts";
import type { MemoryStore } from "./memory-store.ts";
import { PluginRegistry } from "./plugin-registry.ts";
import { SessionManager } from "./session-manager.ts";
import type { GatewayConfig, GatewayMode } from "./types.ts";

export { MemoryStore } from "./memory-store.ts";
export { MemoryStoreHandle } from "./memory-store-handle.ts";

const PRIORITY_ORDER: Record<string, number> = {
	session_chat: 0,
	memory_search: 1,
	rag_indexing: 2,
};

interface EmbedReq {
	text: string;
	priority: string;
	resolve: (emb: number[]) => void;
	reject: (err: Error) => void;
}

export interface GatewayOpts {
	sessionDir: string;
	config?: Partial<GatewayConfig>;
}

export class Gateway {
	mode: GatewayMode;
	isRunning = false;
	hookEngine: HookEngine;
	private sessionManager: SessionManager;
	private pluginRegistry: PluginRegistry;
	private cronScheduler: CronScheduler;
	private heartbeat: HeartbeatSystem;
	private sessionDir: string;
	private config: GatewayConfig;
	private embedQueue: EmbedReq[] = [];
	private embedFn: ((text: string) => Promise<number[]>) | null = null;
	private processing = false;
	private memoryStore: MemoryStore | null = null;
	private _chatFn: ((messages: AgentMessage[], tools?: any[], signal?: AbortSignal) => Promise<AgentMessage>) | null = null;
	public activeConversations = new Map<string, AgentMessage[]>();

	constructor(opts: GatewayOpts) {
		this.sessionDir = opts.sessionDir;
		this.mode = opts.config?.gateway?.mode ?? "embedded";
		this.config = {
			gateway: {
				port: opts.config?.gateway?.port ?? 3000,
				mode: this.mode,
				pluginDirs: opts.config?.gateway?.pluginDirs ?? [],
			},
			channels: opts.config?.channels ?? {
				qqbot: { appId: "", appSecret: "", enabled: false },
			},
			auth: opts.config?.auth ?? { trustAll: true },
		};
		this.sessionManager = new SessionManager(this.sessionDir);
		this.pluginRegistry = new PluginRegistry();
		this.hookEngine = new HookEngine();
		this.cronScheduler = new CronScheduler();
		this.heartbeat = new HeartbeatSystem();
	}

	async start(): Promise<void> {
		this.isRunning = true;
		if (this.config.gateway.mode === "gateway") {
			const { GatewayServer } = await import("./server.ts");
			const server = new GatewayServer(this, this.config);
			await server.start();
			this._server = server;
		}
	}

	async stop(): Promise<void> {
		if (this._server) {
			await this._server.stop();
			this._server = null;
		}
		await this.pluginRegistry.destroyAll();
		this.isRunning = false;
	}

	setEmbedFn(fn: (text: string) => Promise<number[]>): void {
		this.embedFn = fn;
	}

	setMemoryStore(store: MemoryStore): void {
		this.memoryStore = store;
	}

	setChatFn(fn: (messages: AgentMessage[], tools?: any[], signal?: AbortSignal) => Promise<AgentMessage>): void {
		this._chatFn = fn;
	}

	get chatFn() {
		return this._chatFn;
	}

	async embed(text: string, priority = "memory_search"): Promise<number[]> {
		if (this.embedFn) {
			return new Promise<number[]>((resolve, reject) => {
				this.embedQueue.push({ text, priority, resolve, reject });
				this.embedQueue.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
				this.drainQueue();
			});
		}
		return hashVector(text);
	}

	private drainQueue(): void {
		if (this.processing || !this.embedFn) return;
		this.processing = true;
		this.processNext();
	}

	private async processNext(): Promise<void> {
		while (this.embedQueue.length > 0 && this.embedFn) {
			const req = this.embedQueue.shift()!;
			try {
				const emb = await this.embedFn(req.text);
				req.resolve(emb);
			} catch (err) {
				req.reject(err instanceof Error ? err : new Error(String(err)));
			}
		}
		this.processing = false;
	}

	createPluginContext(pluginId: string, pluginConfig: Record<string, unknown>): PluginContext {
		const logger = createStructuredLogger(pluginId, () => {});
		return {
			logger,
			config: pluginConfig,
			callLLM: async (req: LLMRequest) => ({ text: "stub", model: req.model ?? "default" }) as LLMResponse,
			scheduleCron: (spec: string, handler: () => Promise<void>) => {
				this.cronScheduler.register(`${pluginId}-cron`, spec, handler, {
					jitterMs: 0,
					minIntervalMs: 0,
					pluginName: pluginId,
				});
			},
			callPlugin: async (pluginName: string, method: string, args: Record<string, unknown>) => {
				const entry = this.pluginRegistry.get(pluginName);
				if (!entry) throw new Error(`Plugin '${pluginName}' not found`);
				const inst = entry.instance as any;
				if (typeof inst[method] !== "function")
					throw new Error(`Method '${method}' not found on plugin '${pluginName}'`);
				return inst[method](args);
			},
			getStore: () => {
				if (!this.memoryStore) throw new Error("MemoryStore not configured");
				return new MemoryStoreHandle(this.memoryStore);
			},
		};
	}

	async ingress(msg: import("@ebsclaw/plugin-api").InboundMessage): Promise<void> {
		await this.hookEngine.fire("pre_ingress", msg);
	}

	async egress(channelId: string, msg: import("@ebsclaw/plugin-api").OutboundMessage): Promise<void> {
		await this.hookEngine.fire("pre_egress", { channelId, msg });
	}

	async dispatchInboundMessage(sessionId: string, content: string, sendBack: (msg: any) => void): Promise<void> {
		const { dispatchInboundMessage: dispatch } = await import("./agent-dispatch.ts");
		return dispatch(this, sessionId, content, sendBack);
	}

	async dispatchAgentRunFromGateway(request: any): Promise<any> {
		const { dispatchAgentRunFromGateway: dispatch } = await import("./agent-dispatch.ts");
		return dispatch(this, request);
	}

	async registerPlugin(manifest: PluginManifest, instance: Plugin, dir: string): Promise<boolean> {
		const ctx = this.createPluginContext(manifest.name, {});
		return this.pluginRegistry.register(manifest, instance, dir, ctx);
	}
}
