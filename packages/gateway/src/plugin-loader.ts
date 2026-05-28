import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Plugin, PluginContext, PluginManifest } from "@ebsclaw/plugin-api";
import type { LoadedPlugin } from "./types.ts";

export class PluginLoader {
	async load(pluginDir: string): Promise<LoadedPlugin> {
		const manifestPath = join(pluginDir, "ebsclaw.manifest.json");
		if (!existsSync(manifestPath)) {
			throw new Error(`Manifest not found in ${pluginDir}`);
		}

		const raw = readFileSync(manifestPath, "utf-8");
		const manifest = JSON.parse(raw) as PluginManifest;

		const indexPath = join(pluginDir, "index.ts");
		const mod = await import(indexPath);
		const instance = (mod.default ?? mod) as Plugin;

		return { manifest, instance, dir: pluginDir };
	}
}
