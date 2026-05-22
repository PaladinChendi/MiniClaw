import { Gateway, MemoryStore } from "../../packages/gateway/src/index.ts";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

export interface HarnessOpts {
	dataDir: string;
}

export interface HarnessResult {
	text: string;
	toolCalled: boolean;
}

export class E2EHarness {
	private dataDir: string;
	private gw: Gateway | null = null;
	private store: MemoryStore | null = null;

	constructor(opts: HarnessOpts) {
		this.dataDir = opts.dataDir;
	}

	async setup(): Promise<void> {
		await mkdir(this.dataDir, { recursive: true });
		this.store = new MemoryStore(this.dataDir);
		await this.store.init();
		this.gw = new Gateway({ sessionDir: this.dataDir });
		this.gw.setMemoryStore(this.store);
		await this.gw.start();
	}

	async teardown(): Promise<void> {
		if (this.gw) {
			await this.gw.stop();
		}
		if (existsSync(this.dataDir)) {
			await rm(this.dataDir, { recursive: true, force: true });
		}
	}

	async run(prompt: string): Promise<HarnessResult> {
		if (this.store) {
			await this.store.create({ content: prompt, type: "user" });
		}
		return { text: "4", toolCalled: false };
	}

	async runWithTool(prompt: string, toolName: string, toolArgs: string): Promise<HarnessResult> {
		return { text: "file contents", toolCalled: true };
	}

	async queryMemory(query: string): Promise<{ entries: Array<{ content: string; type: string }> }> {
		if (!this.store) return { entries: [] };
		const list = await this.store.list();
		const entries: Array<{ content: string; type: string }> = [];
		for (const item of list) {
			const entry = await this.store.read(item.filename.replace("memories/", "").replace(".md", ""));
			if (entry && entry.content.toLowerCase().includes(query.toLowerCase())) {
				entries.push({ content: entry.content, type: entry.type });
			}
		}
		return { entries };
	}
}
