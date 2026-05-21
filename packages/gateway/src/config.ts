import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import type { GatewayConfig, GatewayMode } from "./types.ts";

export const DEFAULT_CONFIG: GatewayConfig = {
	gateway: {
		port: 3000,
		mode: "embedded",
		pluginDirs: [],
	},
	channels: {
		qqbot: {
			appId: "",
			appSecret: "",
			enabled: false,
		},
	},
	auth: {
		trustAll: true,
	},
};

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
	const result = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			typeof base[key] === "object"
		) {
			result[key] = deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>);
		} else {
			result[key] = value;
		}
	}
	return result;
}

const VALID_MODES: GatewayMode[] = ["embedded", "gateway"];

export async function loadConfig(configPath: string): Promise<GatewayConfig> {
	if (!existsSync(configPath)) {
		return { ...DEFAULT_CONFIG };
	}

	const raw = readFileSync(configPath, "utf-8");
	const parsed = parse(raw) as Partial<GatewayConfig>;

	if (parsed.gateway?.mode && !VALID_MODES.includes(parsed.gateway.mode)) {
		throw new Error(`mode must be one of: ${VALID_MODES.join(", ")}`);
	}

	return deepMerge(DEFAULT_CONFIG, parsed as Record<string, unknown>) as GatewayConfig;
}
