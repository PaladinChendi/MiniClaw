import type { PluginManifest } from "@miniclaw/plugin-api";

export type GatewayMode = "embedded" | "gateway";

export interface GatewayConfig {
	gateway: {
		port: number;
		mode: GatewayMode;
		pluginDirs: string[];
	};
	channels: {
		qqbot: {
			appId: string;
			appSecret: string;
			enabled: boolean;
		};
	};
	auth: {
		trustAll: boolean;
		token?: string;
	};
}

export interface LoadedPlugin {
	manifest: PluginManifest;
	instance: import("@miniclaw/plugin-api").Plugin;
	dir: string;
}

export interface HookEntry {
	name: string;
	priority: number;
	handler: (...args: unknown[]) => Promise<void>;
}

export interface SessionState {
	id: string;
	messages: unknown[];
	createdAt: number;
	updatedAt: number;
	tokenCount?: number;
}

export interface CronEntry {
	id: string;
	spec: string;
	handler: () => Promise<void>;
	jitterMs: number;
	minIntervalMs: number;
	lastRunAt: number | null;
	pluginName: string;
}
