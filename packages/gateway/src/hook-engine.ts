import type { HookEntry } from "./types.ts";

type HookName = "pre_ingress" | "pre_egress";

export class HookEngine {
	private hooks = new Map<HookName, HookEntry[]>();

	register(
		name: HookName,
		hookId: string,
		handler: (...args: unknown[]) => Promise<void>,
		opts: { priority?: number } = {},
	): void {
		const entries = this.hooks.get(name) ?? [];
		const existing = entries.findIndex((e) => e.name === hookId);
		if (existing >= 0) entries.splice(existing, 1);
		entries.push({ name: hookId, priority: opts.priority ?? 100, handler });
		entries.sort((a, b) => a.priority - b.priority);
		this.hooks.set(name, entries);
	}

	unregister(name: HookName, hookId: string): void {
		const entries = this.hooks.get(name);
		if (!entries) return;
		this.hooks.set(
			name,
			entries.filter((e) => e.name !== hookId),
		);
	}

	async fire(name: HookName, data: unknown): Promise<void> {
		const entries = this.hooks.get(name) ?? [];
		for (const entry of entries) {
			try {
				await entry.handler(data);
			} catch {
				// isolate: log and continue
			}
		}
	}
}
