import type { Plugin, PluginContext, PluginManifest } from "@ebsclaw/plugin-api";
import type { LoadedPlugin } from "./types.ts";

export class PluginRegistry {
	private plugins = new Map<string, LoadedPlugin>();

	async register(manifest: PluginManifest, instance: Plugin, dir: string, ctx: PluginContext): Promise<boolean> {
		try {
			await instance.init(ctx);
			this.plugins.set(manifest.name, { manifest, instance, dir });
			return true;
		} catch {
			return false;
		}
	}

	get(name: string): LoadedPlugin | undefined {
		return this.plugins.get(name);
	}

	list(): LoadedPlugin[] {
		return [...this.plugins.values()];
	}

	async destroyAll(): Promise<void> {
		for (const [name, loaded] of this.plugins) {
			try {
				await loaded.instance.destroy();
			} catch {
				// isolate
			}
		}
		this.plugins.clear();
	}
}
