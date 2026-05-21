import type { GatewayMode, GatewayConfig } from "./types.ts";
import type { Plugin, PluginManifest, PluginContext, LLMRequest, LLMResponse } from "@ebsclaw/plugin-api";
import { SessionManager } from "./session-manager.ts";
import { PluginRegistry } from "./plugin-registry.ts";
import { HookEngine } from "./hook-engine.ts";
import { CronScheduler } from "./cron-scheduler.ts";
import { HeartbeatSystem } from "./heartbeat.ts";
import { createStructuredLogger } from "@ebsclaw/shared";

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
		this.cronScheduler = new CronScheduler({ minIntervalMs: 0 });
		this.heartbeat = new HeartbeatSystem();
	}

	async start(): Promise<void> {
		this.isRunning = true;
	}

	async stop(): Promise<void> {
		await this.pluginRegistry.destroyAll();
		this.isRunning = false;
	}

	createPluginContext(pluginId: string, pluginConfig: Record<string, unknown>): PluginContext {
		const logger = createStructuredLogger(pluginId, () => {});
		return {
			logger,
			config: pluginConfig,
			callLLM: async (req: LLMRequest) => ({ text: "stub", model: req.model ?? "default" }) as LLMResponse,
			scheduleCron: (spec: string, handler: () => Promise<void>) => {
				this.cronScheduler.register(`${pluginId}-cron`, spec, handler);
			},
		};
	}

	async ingress(msg: import("@ebsclaw/plugin-api").InboundMessage): Promise<void> {
		await this.hookEngine.fire("pre_ingress", msg);
	}

	async egress(channelId: string, msg: import("@ebsclaw/plugin-api").OutboundMessage): Promise<void> {
		await this.hookEngine.fire("pre_egress", { channelId, msg });
	}

	async registerPlugin(manifest: PluginManifest, instance: Plugin, dir: string): Promise<boolean> {
		const ctx = this.createPluginContext(manifest.name, {});
		return this.pluginRegistry.register(manifest, instance, dir, ctx);
	}
}
