import type { MemoryStore } from "./memory-store.ts";
import type { MemoryFileEntry, MemoryIndexEntry } from "@ebsclaw/memory/types";

export class MemoryStoreHandle {
	private store: MemoryStore;

	constructor(store: MemoryStore) {
		this.store = store;
	}

	async read(id: string): Promise<MemoryFileEntry | null> {
		return this.store.read(id);
	}

	async list(): Promise<MemoryIndexEntry[]> {
		return this.store.list();
	}

	create(_data: { content: string; type: import("@ebsclaw/plugin-api").MemoryType; scope?: "private" | "team" }): Promise<string> {
		throw new Error("MemoryStoreHandle is read-only; use PluginContext.store() to write");
	}

	update(_id: string, _data: { content?: string }): Promise<void> {
		throw new Error("MemoryStoreHandle is read-only; use PluginContext.store() to write");
	}

	delete(_id: string): Promise<void> {
		throw new Error("MemoryStoreHandle is read-only; use PluginContext.store() to write");
	}
}
