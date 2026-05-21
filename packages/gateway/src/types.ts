import type { PluginManifest } from "@ebsclaw/plugin-api";

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
	};
}

export interface LoadedPlugin {
	manifest: PluginManifest;
	instance: import("@ebsclaw/plugin-api").Plugin;
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
