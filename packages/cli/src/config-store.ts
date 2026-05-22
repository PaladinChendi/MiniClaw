import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export interface ProviderConfig {
	provider: string;
	apiKey: string;
}

export class ConfigStore {
	private path: string;

	constructor(path: string) {
		this.path = path;
	}

	async save(config: ProviderConfig): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true });
		const yaml = `provider: ${config.provider}\napiKey: ${config.apiKey}\n`;
		await writeFile(this.path, yaml, "utf-8");
	}

	async load(): Promise<ProviderConfig | null> {
		if (!existsSync(this.path)) return null;
		const content = await readFile(this.path, "utf-8");
		const config: Record<string, string> = {};
		for (const line of content.split("\n")) {
			const [key, ...rest] = line.split(":");
			if (key && rest.length) {
				config[key.trim()] = rest.join(":").trim();
			}
		}
		if (!config.provider) return null;
		return { provider: config.provider, apiKey: config.apiKey ?? "" };
	}
}
