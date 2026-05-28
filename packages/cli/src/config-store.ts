import { existsSync } from "fs";
import { dirname } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import YAML from "yaml";

export interface ProviderConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export class ConfigStore {
	private path: string;

	constructor(path: string) {
		this.path = path;
	}

	async save(config: ProviderConfig): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true });
		const yaml = YAML.stringify({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
		await writeFile(this.path, yaml, "utf-8");
	}

	async load(): Promise<ProviderConfig | null> {
		if (!existsSync(this.path)) return null;
		const content = await readFile(this.path, "utf-8");
		const parsed = YAML.parse(content) as Record<string, string> | null;
		if (!parsed?.apiKey || !parsed?.model) return null;
		return { baseUrl: parsed.baseUrl ?? "", apiKey: parsed.apiKey, model: parsed.model };
	}
}
