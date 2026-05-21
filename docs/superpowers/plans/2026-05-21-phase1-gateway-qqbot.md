# Phase 1: Gateway Core + QQbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Gateway daemon with Plugin Registry, Session Manager, Hook Engine, Cron Scheduler, Heartbeat System, QQbot channel plugin, and CLI commands — enabling the first end-to-end message flow from QQ to agent and back.

**Architecture:** Bun workspace monorepo. Gateway runs as a singleton daemon class supporting Embedded mode (in-process with TUI). Plugin Registry loads plugins from extensions/ directories, manages lifecycle via Plugin interface. Session Manager persists to disk via writeFileAtomic. Hook Engine fires pre_ingress/pre_egress hooks (isolate on failure). All v1 plugins are trusted (B1 deferred to v1.1).

**Tech Stack:** TypeScript 5.x, Bun 1.3+, bun test, biome, ink (for TUI later), yaml (config parsing)

---

## File Structure

```
packages/gateway/src/
  index.ts                  — Gateway class, Embedded mode
  plugin-registry.ts       — PluginRegistry: load/unload/lifecycle
  plugin-loader.ts          — loadPlugin from manifest + dir
  session-manager.ts        — SessionManager: CRUD + disk persistence
  hook-engine.ts            — HookEngine: pre/post hooks
  cron-scheduler.ts         — CronScheduler: deterministic jitter
  heartbeat.ts              — HeartbeatSystem
  config.ts                 — load ~/.ebsclaw/config.yaml
  types.ts                  — Internal Gateway types
packages/gateway/test/
  plugin-registry.test.ts
  session-manager.test.ts
  hook-engine.test.ts
  cron-scheduler.test.ts
  gateway.test.ts
  config.test.ts
extensions/channels/qqbot/src/
  index.ts                  — ChannelPlugin implementation
  qq-api.ts                 — QQ Bot API client
  types.ts                  — QQ-specific message types
extensions/channels/qqbot/test/
  index.test.ts
  qq-api.test.ts
packages/cli/src/
  index.ts                  — CLI entry point
  commands/
    gateway-start.ts
    tui.ts
packages/cli/test/
  commands.test.ts
```

---

### Task 1: Gateway Types + Config Loader

**Files:**
- Create: `packages/gateway/src/types.ts`
- Create: `packages/gateway/src/config.ts`
- Test: `packages/gateway/test/config.test.ts`
- Modify: `packages/gateway/package.json` (add dependencies)

- [ ] **Step 1: Add dependencies to gateway package.json**

`packages/gateway/package.json`:
```json
{
  "name": "@ebsclaw/gateway",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Run: `cd /mnt/d/ebsclaw && bun install`
Expected: workspace links resolved, yaml installed

- [ ] **Step 2: Write failing config test**

`packages/gateway/test/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, DEFAULT_CONFIG } from "@ebsclaw/gateway/config";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";

const tmpDir = join(import.meta.dir, "__tmp_config__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("returns DEFAULT_CONFIG when no config file exists", async () => {
		const config = await loadConfig(join(tmpDir, "nonexistent.yaml"));
		expect(config.gateway.port).toBe(DEFAULT_CONFIG.gateway.port);
		expect(config.gateway.mode).toBe("embedded");
	});

	it("parses a valid config.yaml with all fields", async () => {
		const yamlPath = join(tmpDir, "config.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  port: 9090
  mode: embedded
  pluginDirs:
    - ./ext1
    - ./ext2
channels:
  qqbot:
    appId: "12345"
    appSecret: "secret"
    enabled: true
auth:
  trustAll: true
`.trim(),
		);
		const config = await loadConfig(yamlPath);
		expect(config.gateway.port).toBe(9090);
		expect(config.gateway.mode).toBe("embedded");
		expect(config.gateway.pluginDirs).toEqual(["./ext1", "./ext2"]);
		expect(config.channels.qqbot.appId).toBe("12345");
		expect(config.channels.qqbot.enabled).toBe(true);
		expect(config.auth.trustAll).toBe(true);
	});

	it("merges partial config with defaults", async () => {
		const yamlPath = join(tmpDir, "partial.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  port: 8080
`.trim(),
		);
		const config = await loadConfig(yamlPath);
		expect(config.gateway.port).toBe(8080);
		expect(config.gateway.mode).toBe("embedded");
		expect(config.gateway.pluginDirs).toEqual([]);
	});

	it("throws on invalid mode value", async () => {
		const yamlPath = join(tmpDir, "bad-mode.yaml");
		await writeFile(
			yamlPath,
			`
gateway:
  mode: invalid
`.trim(),
		);
		expect(loadConfig(yamlPath)).rejects.toThrow(/mode must be/);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement types.ts**

`packages/gateway/src/types.ts`:
```typescript
import type { Plugin, PluginManifest } from "@ebsclaw/plugin-api";

/** Gateway operational mode */
export type GatewayMode = "embedded" | "daemon";

/** Hook point identifiers */
export type HookPoint = "pre_ingress" | "pre_egress";

/** Hook function signature */
export type HookFunction = (payload: unknown) => Promise<unknown>;

/** Hook registration entry */
export interface HookRegistration {
	point: HookPoint;
	pluginName: string;
	handler: HookFunction;
	priority: number;
}

/** Loaded plugin with metadata */
export interface LoadedPlugin {
	name: string;
	manifest: PluginManifest;
	instance: Plugin;
	dir: string;
}

/** Cron job entry */
export interface CronEntry {
	id: string;
	spec: string;
	handler: () => Promise<void>;
	jitterMs: number;
	minIntervalMs: number;
	lastRunAt: number | null;
	pluginName: string;
}

/** Heartbeat check function */
export type HealthCheck = () => Promise<HealthStatus>;

/** Health status result */
export interface HealthStatus {
	alive: boolean;
	latencyMs?: number;
	details?: Record<string, unknown>;
}

/** Internal gateway config shape */
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
```

- [ ] **Step 5: Implement config.ts**

`packages/gateway/src/config.ts`:
```typescript
import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { GatewayConfig, GatewayMode } from "./types";

export const DEFAULT_CONFIG: GatewayConfig = {
	gateway: {
		port: 8765,
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

const VALID_MODES: GatewayMode[] = ["embedded", "daemon"];

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		if (
			source[key] &&
			typeof source[key] === "object" &&
			!Array.isArray(source[key]) &&
			target[key] &&
			typeof (target as Record<string, unknown>)[key] === "object" &&
			!Array.isArray((target as Record<string, unknown>)[key])
		) {
			result[key] = deepMerge(
				(target as Record<string, unknown>)[key] as Record<string, unknown>,
				source[key] as Record<string, unknown>,
			);
		} else {
			result[key] = source[key];
		}
	}
	return result;
}

export async function loadConfig(configPath: string): Promise<GatewayConfig> {
	if (!existsSync(configPath)) {
		return structuredClone(DEFAULT_CONFIG);
	}

	const raw = readFileSync(configPath, "utf-8");
	const parsed = parseYaml(raw) as Record<string, unknown>;
	const merged = deepMerge(
		structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
		parsed,
	) as unknown as GatewayConfig;

	if (!VALID_MODES.includes(merged.gateway.mode)) {
		throw new Error(`mode must be one of: ${VALID_MODES.join(", ")}, got: ${merged.gateway.mode}`);
	}

	return merged;
}
```

- [ ] **Step 6: Run config tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/config.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/types.ts packages/gateway/src/config.ts packages/gateway/test/config.test.ts packages/gateway/package.json bun.lock
git commit -m "feat(gateway): add internal types and YAML config loader with defaults"
```

---

### Task 2: Session Manager — CRUD + Disk Persistence

**Files:**
- Create: `packages/gateway/src/session-manager.ts`
- Test: `packages/gateway/test/session-manager.test.ts`

- [ ] **Step 1: Write failing session manager test**

`packages/gateway/test/session-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "@ebsclaw/gateway/session-manager";
import { mkdir, rm, readFile, existsSync } from "fs/promises";
import { join } from "path";
import type { SessionSnapshot } from "@ebsclaw/plugin-api";

const tmpDir = join(import.meta.dir, "__tmp_session__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("SessionManager", () => {
	it("creates a session and persists to disk", async () => {
		const sm = new SessionManager(tmpDir);
		const session = await sm.create("sess-1");
		expect(session.id).toBe("sess-1");
		expect(session.messages).toEqual([]);
		expect(typeof session.createdAt).toBe("number");

		const filePath = join(tmpDir, "sess-1.json");
		expect(existsSync(filePath)).toBe(true);
		const raw = JSON.parse(await readFile(filePath, "utf-8"));
		expect(raw.id).toBe("sess-1");
	});

	it("reads an existing session from disk", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("sess-2");
		const loaded = await sm.get("sess-2");
		expect(loaded).toBeDefined();
		expect(loaded!.id).toBe("sess-2");
	});

	it("returns undefined for nonexistent session", async () => {
		const sm = new SessionManager(tmpDir);
		const result = await sm.get("no-such-session");
		expect(result).toBeUndefined();
	});

	it("updates a session and persists changes", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("sess-3");
		await sm.update("sess-3", (snap) => {
			snap.messages.push({ role: "user", content: "hello" });
			return snap;
		});
		const updated = await sm.get("sess-3");
		expect(updated!.messages.length).toBe(1);
		expect((updated!.messages[0] as any).content).toBe("hello");
	});

	it("deletes a session and removes from disk", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("sess-4");
		await sm.delete("sess-4");
		expect(await sm.get("sess-4")).toBeUndefined();
		expect(existsSync(join(tmpDir, "sess-4.json"))).toBe(false);
	});

	it("lists all sessions", async () => {
		const sm = new SessionManager(tmpDir);
		await sm.create("sess-a");
		await sm.create("sess-b");
		await sm.create("sess-c");
		const all = await sm.list();
		expect(all.length).toBe(3);
		const ids = all.map((s) => s.id).sort();
		expect(ids).toEqual(["sess-a", "sess-b", "sess-c"]);
	});

	it("update bumps updatedAt timestamp", async () => {
		const sm = new SessionManager(tmpDir);
		const created = await sm.create("sess-ts");
		const beforeUpdate = created.updatedAt;
		// Small delay to ensure timestamp changes
		await new Promise((r) => setTimeout(r, 2));
		await sm.update("sess-ts", (snap) => {
			snap.messages.push({ role: "user", content: "hi" });
			return snap;
		});
		const updated = await sm.get("sess-ts");
		expect(updated!.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/session-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement session-manager.ts**

`packages/gateway/src/session-manager.ts`:
```typescript
import { join } from "path";
import { existsSync } from "fs";
import { readFile, unlink } from "fs/promises";
import { writeFileAtomic } from "@ebsclaw/shared";
import type { SessionSnapshot } from "@ebsclaw/plugin-api";

export class SessionManager {
	private dataDir: string;

	constructor(dataDir: string) {
		this.dataDir = dataDir;
	}

	private filePath(id: string): string {
		return join(this.dataDir, `${id}.json`);
	}

	async create(id: string): Promise<SessionSnapshot> {
		const now = Date.now();
		const snapshot: SessionSnapshot = {
			id,
			messages: [],
			createdAt: now,
			updatedAt: now,
		};
		await writeFileAtomic(this.filePath(id), JSON.stringify(snapshot, null, 2));
		return snapshot;
	}

	async get(id: string): Promise<SessionSnapshot | undefined> {
		const fp = this.filePath(id);
		if (!existsSync(fp)) return undefined;
		const raw = await readFile(fp, "utf-8");
		return JSON.parse(raw) as SessionSnapshot;
	}

	async update(id: string, mutator: (snap: SessionSnapshot) => SessionSnapshot): Promise<SessionSnapshot> {
		const existing = await this.get(id);
		if (!existing) throw new Error(`Session not found: ${id}`);
		const updated = mutator(structuredClone(existing));
		updated.updatedAt = Date.now();
		await writeFileAtomic(this.filePath(id), JSON.stringify(updated, null, 2));
		return updated;
	}

	async delete(id: string): Promise<void> {
		const fp = this.filePath(id);
		if (existsSync(fp)) {
			await unlink(fp);
		}
	}

	async list(): Promise<SessionSnapshot[]> {
		const { readdir } = await import("fs/promises");
		const { stat } = await import("fs/promises");
		const entries = await readdir(this.dataDir);
		const sessions: SessionSnapshot[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;
			const fullPath = join(this.dataDir, entry);
			const raw = await readFile(fullPath, "utf-8");
			sessions.push(JSON.parse(raw) as SessionSnapshot);
		}
		return sessions;
	}
}
```

- [ ] **Step 4: Run session manager tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/session-manager.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/session-manager.ts packages/gateway/test/session-manager.test.ts
git commit -m "feat(gateway): add SessionManager with CRUD and atomic disk persistence"
```

---

### Task 3: Hook Engine — pre_ingress / pre_egress + Failure Isolation

**Files:**
- Create: `packages/gateway/src/hook-engine.ts`
- Test: `packages/gateway/test/hook-engine.test.ts`

- [ ] **Step 1: Write failing hook engine test**

`packages/gateway/test/hook-engine.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { HookEngine } from "@ebsclaw/gateway/hook-engine";
import type { HookPoint, HookFunction } from "@ebsclaw/gateway/types";

describe("HookEngine", () => {
	it("registers and fires a hook successfully", async () => {
		const engine = new HookEngine();
		const results: unknown[] = [];
		engine.register("pre_ingress", "plugin-a", async (payload) => {
			results.push(payload);
			return { ...payload, tagged: true };
		}, 0);
		const out = await engine.fire("pre_ingress", { msg: "hello" });
		expect(results.length).toBe(1);
		expect((out as any).tagged).toBe(true);
	});

	it("fires hooks in priority order (lower = earlier)", async () => {
		const engine = new HookEngine();
		const order: string[] = [];
		engine.register("pre_ingress", "p-low", async (payload) => {
			order.push("low");
			return payload;
		}, 10);
		engine.register("pre_ingress", "p-high", async (payload) => {
			order.push("high");
			return payload;
		}, 0);
		await engine.fire("pre_ingress", {});
		expect(order).toEqual(["high", "low"]);
	});

	it("isolates failing hook — other hooks still run, failure logged", async () => {
		const engine = new HookEngine();
		const errors: Array<{ pluginName: string; error: Error }> = [];
		engine.onError = (pluginName, error) => errors.push({ pluginName, error });

		engine.register("pre_ingress", "good", async (payload) => {
			return { ...payload, good: true };
		}, 0);
		engine.register("pre_ingress", "bad", async (_payload) => {
			throw new Error("hook crash");
		}, 1);
		engine.register("pre_ingress", "also-good", async (payload) => {
			return { ...payload, alsoGood: true };
		}, 2);

		const out = await engine.fire("pre_ingress", {});
		expect((out as any).good).toBe(true);
		expect((out as any).alsoGood).toBe(true);
		expect(errors.length).toBe(1);
		expect(errors[0].pluginName).toBe("bad");
		expect(errors[0].error.message).toBe("hook crash");
	});

	it("chains hook output as input to next hook", async () => {
		const engine = new HookEngine();
		engine.register("pre_ingress", "step1", async (payload) => {
			return { ...payload, step1: true };
		}, 0);
		engine.register("pre_ingress", "step2", async (payload) => {
			return { ...payload, step2: true };
		}, 1);
		const out = await engine.fire("pre_ingress", { original: true });
		expect((out as any).original).toBe(true);
		expect((out as any).step1).toBe(true);
		expect((out as any).step2).toBe(true);
	});

	it("unregisters hooks by plugin name", async () => {
		const engine = new HookEngine();
		engine.register("pre_ingress", "removable", async (p) => p, 0);
		engine.unregister("removable");
		const out = await engine.fire("pre_ingress", { value: 42 });
		expect((out as any).value).toBe(42);
	});

	it("fires no-op when no hooks registered", async () => {
		const engine = new HookEngine();
		const out = await engine.fire("pre_egress", { data: "test" });
		expect(out).toEqual({ data: "test" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/hook-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hook-engine.ts**

`packages/gateway/src/hook-engine.ts`:
```typescript
import type { HookPoint, HookFunction, HookRegistration } from "./types";

export class HookEngine {
	private hooks: HookRegistration[] = [];
	public onError?: (pluginName: string, error: Error) => void;

	register(point: HookPoint, pluginName: string, handler: HookFunction, priority: number): void {
		this.hooks.push({ point, pluginName, handler, priority });
		this.hooks.sort((a, b) => a.priority - b.priority);
	}

	unregister(pluginName: string): void {
		this.hooks = this.hooks.filter((h) => h.pluginName !== pluginName);
	}

	async fire(point: HookPoint, payload: unknown): Promise<unknown> {
		let current = payload;
		for (const hook of this.hooks) {
			if (hook.point !== point) continue;
			try {
				current = await hook.handler(current);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				this.onError?.(hook.pluginName, error);
				// Isolate: skip this hook's output, continue with previous payload
			}
		}
		return current;
	}
}
```

- [ ] **Step 4: Run hook engine tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/hook-engine.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/hook-engine.ts packages/gateway/test/hook-engine.test.ts
git commit -m "feat(gateway): add HookEngine with priority ordering and failure isolation"
```

---

### Task 4: Cron Scheduler — Deterministic Jitter + Min Interval Guard

**Files:**
- Create: `packages/gateway/src/cron-scheduler.ts`
- Test: `packages/gateway/test/cron-scheduler.test.ts`

- [ ] **Step 1: Write failing cron scheduler test**

`packages/gateway/test/cron-scheduler.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronScheduler } from "@ebsclaw/gateway/cron-scheduler";

describe("CronScheduler", () => {
	let scheduler: CronScheduler;

	beforeEach(() => {
		scheduler = new CronScheduler();
	});

	afterEach(() => {
		scheduler.stopAll();
	});

	it("registers a cron entry and reports it", () => {
		scheduler.register("test-job", "*/5 * * * *", async () => {}, {
			jitterMs: 100,
			minIntervalMs: 300000,
			pluginName: "test-plugin",
		});
		const entries = scheduler.list();
		expect(entries.length).toBe(1);
		expect(entries[0].id).toBe("test-job");
		expect(entries[0].spec).toBe("*/5 * * * *");
	});

	it("applies deterministic jitter based on job id", () => {
		scheduler.register("job-a", "0 * * * *", async () => {}, {
			jitterMs: 1000,
			minIntervalMs: 0,
			pluginName: "p",
		});
		scheduler.register("job-b", "0 * * * *", async () => {}, {
			jitterMs: 1000,
			minIntervalMs: 0,
			pluginName: "p",
		});
		const entries = scheduler.list();
		// Deterministic: same id always produces same jitter
		const jitterA = scheduler.computeJitter("job-a", 1000);
		const jitterB = scheduler.computeJitter("job-b", 1000);
		expect(jitterA).toBeGreaterThanOrEqual(0);
		expect(jitterA).toBeLessThanOrEqual(1000);
		expect(jitterB).toBeGreaterThanOrEqual(0);
		expect(jitterB).toBeLessThanOrEqual(1000);
		// Different ids produce different jitter (probabilistically guaranteed by hash)
		expect(jitterA).not.toBe(jitterB);
	});

	it("deterministic jitter is stable across calls", () => {
		const j1 = scheduler.computeJitter("stable-id", 5000);
		const j2 = scheduler.computeJitter("stable-id", 5000);
		expect(j1).toBe(j2);
	});

	it("unregisters a cron entry by id", () => {
		scheduler.register("removable", "0 * * * *", async () => {}, {
			jitterMs: 0,
			minIntervalMs: 0,
			pluginName: "p",
		});
		scheduler.unregister("removable");
		expect(scheduler.list().length).toBe(0);
	});

	it("min interval guard prevents rapid re-execution", async () => {
		let callCount = 0;
		scheduler.register("fast-job", "* * * * * *", async () => {
			callCount++;
		}, {
			jitterMs: 0,
			minIntervalMs: 10000,
			pluginName: "p",
		});

		// Simulate two rapid fires
		await scheduler.tryRun("fast-job");
		await scheduler.tryRun("fast-job");
		expect(callCount).toBe(1);
	});

	it("tryRun updates lastRunAt on success", async () => {
		scheduler.register("track-job", "* * * * * *", async () => {}, {
			jitterMs: 0,
			minIntervalMs: 0,
			pluginName: "p",
		});
		const before = scheduler.list().find((e) => e.id === "track-job")!.lastRunAt;
		expect(before).toBeNull();
		await scheduler.tryRun("track-job");
		const after = scheduler.list().find((e) => e.id === "track-job")!.lastRunAt;
		expect(after).not.toBeNull();
	});

	it("computeJitter returns 0 when jitterMs is 0", () => {
		expect(scheduler.computeJitter("any", 0)).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/cron-scheduler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cron-scheduler.ts**

`packages/gateway/src/cron-scheduler.ts`:
```typescript
import type { CronEntry } from "./types";

export interface CronRegisterOptions {
	jitterMs: number;
	minIntervalMs: number;
	pluginName: string;
}

export class CronScheduler {
	private entries: Map<string, CronEntry> = new Map();
	private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	/** Deterministic jitter using a simple hash of the job id */
	computeJitter(id: string, jitterMs: number): number {
		if (jitterMs <= 0) return 0;
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
		}
		// Map hash to [0, jitterMs)
		return Math.abs(hash % jitterMs);
	}

	register(id: string, spec: string, handler: () => Promise<void>, opts: CronRegisterOptions): void {
		const entry: CronEntry = {
			id,
			spec,
			handler,
			jitterMs: opts.jitterMs,
			minIntervalMs: opts.minIntervalMs,
			lastRunAt: null,
			pluginName: opts.pluginName,
		};
		this.entries.set(id, entry);
	}

	unregister(id: string): void {
		this.entries.delete(id);
		const timer = this.timers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.timers.delete(id);
		}
	}

	list(): CronEntry[] {
		return Array.from(this.entries.values());
	}

	async tryRun(id: string): Promise<boolean> {
		const entry = this.entries.get(id);
		if (!entry) return false;

		// Min interval guard
		if (entry.minIntervalMs > 0 && entry.lastRunAt !== null) {
			const elapsed = Date.now() - entry.lastRunAt;
			if (elapsed < entry.minIntervalMs) {
				return false;
			}
		}

		// Apply deterministic jitter
		const jitter = this.computeJitter(id, entry.jitterMs);
		await new Promise((r) => setTimeout(r, jitter));

		await entry.handler();
		entry.lastRunAt = Date.now();
		return true;
	}

	stopAll(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}
}
```

- [ ] **Step 4: Run cron scheduler tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/cron-scheduler.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/cron-scheduler.ts packages/gateway/test/cron-scheduler.test.ts
git commit -m "feat(gateway): add CronScheduler with deterministic jitter and min interval guard"
```

---

### Task 5: Heartbeat System

**Files:**
- Create: `packages/gateway/src/heartbeat.ts`
- Test: `packages/gateway/test/heartbeat.test.ts`

- [ ] **Step 1: Write failing heartbeat test**

`packages/gateway/test/heartbeat.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { HeartbeatSystem } from "@ebsclaw/gateway/heartbeat";

describe("HeartbeatSystem", () => {
	it("registers a health check and reports status", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("db", async () => ({ alive: true, latencyMs: 5 }));
		hb.register("llm", async () => ({ alive: true, latencyMs: 120 }));

		const status = await hb.check();
		expect(status.db.alive).toBe(true);
		expect(status.db.latencyMs).toBe(5);
		expect(status.llm.alive).toBe(true);
	});

	it("reports dead when health check throws", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("flaky", async () => {
			throw new Error("connection refused");
		});

		const status = await hb.check();
		expect(status.flaky.alive).toBe(false);
		expect((status.flaky.details as any).error).toContain("connection refused");
	});

	it("reports dead when health check returns alive:false", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("down", async () => ({ alive: false }));

		const status = await hb.check();
		expect(status.down.alive).toBe(false);
	});

	it("unregisters a health check", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("temp", async () => ({ alive: true }));
		hb.unregister("temp");
		const status = await hb.check();
		expect(status.temp).toBeUndefined();
	});

	it("isAlive returns true when all checks pass", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("a", async () => ({ alive: true }));
		hb.register("b", async () => ({ alive: true }));
		expect(await hb.isAlive()).toBe(true);
	});

	it("isAlive returns false when any check fails", async () => {
		const hb = new HeartbeatSystem(30000);
		hb.register("ok", async () => ({ alive: true }));
		hb.register("bad", async () => ({ alive: false }));
		expect(await hb.isAlive()).toBe(false);
	});

	it("starts and stops periodic heartbeat", async () => {
		const hb = new HeartbeatSystem(50);
		let checkCount = 0;
		hb.register("counter", async () => {
			checkCount++;
			return { alive: true };
		});
		hb.start();
		await new Promise((r) => setTimeout(r, 130));
		hb.stop();
		// With 50ms interval, should have at least 2 checks
		expect(checkCount).toBeGreaterThanOrEqual(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/heartbeat.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement heartbeat.ts**

`packages/gateway/src/heartbeat.ts`:
```typescript
import type { HealthCheck, HealthStatus } from "./types";

export class HeartbeatSystem {
	private intervalMs: number;
	private checks: Map<string, HealthCheck> = new Map();
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastStatus: Record<string, HealthStatus> = {};

	constructor(intervalMs: number) {
		this.intervalMs = intervalMs;
	}

	register(name: string, check: HealthCheck): void {
		this.checks.set(name, check);
	}

	unregister(name: string): void {
		this.checks.delete(name);
		delete this.lastStatus[name];
	}

	async check(): Promise<Record<string, HealthStatus>> {
		const results: Record<string, HealthStatus> = {};
		for (const [name, checkFn] of this.checks) {
			try {
				const status = await checkFn();
				results[name] = status;
			} catch (err) {
				results[name] = {
					alive: false,
					details: { error: err instanceof Error ? err.message : String(err) },
				};
			}
		}
		this.lastStatus = results;
		return results;
	}

	async isAlive(): Promise<boolean> {
		const status = await this.check();
		return Object.values(status).every((s) => s.alive);
	}

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			this.check().catch(() => {});
		}, this.intervalMs);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
```

- [ ] **Step 4: Run heartbeat tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/heartbeat.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/heartbeat.ts packages/gateway/test/heartbeat.test.ts
git commit -m "feat(gateway): add HeartbeatSystem with periodic health checks"
```

---

### Task 6: Plugin Loader + Plugin Registry — Lifecycle Management

**Files:**
- Create: `packages/gateway/src/plugin-loader.ts`
- Create: `packages/gateway/src/plugin-registry.ts`
- Test: `packages/gateway/test/plugin-registry.test.ts`

- [ ] **Step 1: Write failing plugin registry test**

`packages/gateway/test/plugin-registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { PluginRegistry } from "@ebsclaw/gateway/plugin-registry";
import { PluginLoader } from "@ebsclaw/gateway/plugin-loader";
import type { Plugin, PluginContext } from "@ebsclaw/plugin-api";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";

const tmpDir = join(import.meta.dir, "__tmp_plugin__");

describe("PluginRegistry", () => {
	let registry: PluginRegistry;

	beforeEach(() => {
		registry = new PluginRegistry();
	});

	it("loads a plugin from a directory with manifest", async () => {
		await mkdir(tmpDir, { recursive: true });
		await writeFile(
			join(tmpDir, "ebsclaw.manifest.json"),
			JSON.stringify({
				name: "test-plugin",
				version: "0.1.0",
				type: "channel",
				permissions: { fs: [], net: [], env: [] },
			}),
		);
		await writeFile(
			join(tmpDir, "index.ts"),
			`
			export default {
				async init(ctx) { ctx.logger.info("inited"); },
				async destroy() {},
			};
			`,
		);

		const loader = new PluginLoader();
		const loaded = await loader.load(tmpDir);
		expect(loaded.name).toBe("test-plugin");
		expect(loaded.manifest.type).toBe("channel");
		expect(loaded.instance).toBeDefined();

		await rm(tmpDir, { recursive: true, force: true });
	});

	it("registers a loaded plugin and calls init", async () => {
		const initCalls: string[] = [];
		const plugin: Plugin = {
			async init(_ctx: PluginContext) {
				initCalls.push("init");
			},
			async destroy() {},
		};

		await registry.register("p1", plugin, { logger: console as any, config: {}, callLLM: async () => ({ text: "", model: "" }), scheduleCron: () => {} });
		expect(initCalls).toEqual(["init"]);
		expect(registry.get("p1")).toBeDefined();
	});

	it("destroys a plugin and removes it from registry", async () => {
		const destroyCalls: string[] = [];
		const plugin: Plugin = {
			async init() {},
			async destroy() {
				destroyCalls.push("destroy");
			},
		};

		await registry.register("p2", plugin, { logger: console as any, config: {}, callLLM: async () => ({ text: "", model: "" }), scheduleCron: () => {} });
		await registry.unregister("p2");
		expect(registry.get("p2")).toBeUndefined();
		expect(destroyCalls).toEqual(["destroy"]);
	});

	it("lists all registered plugins", async () => {
		const makePlugin = (): Plugin => ({
			async init() {},
			async destroy() {},
		});
		await registry.register("a", makePlugin(), { logger: console as any, config: {}, callLLM: async () => ({ text: "", model: "" }), scheduleCron: () => {} });
		await registry.register("b", makePlugin(), { logger: console as any, config: {}, callLLM: async () => ({ text: "", model: "" }), scheduleCron: () => {} });
		const names = registry.list().map((p) => p.name);
		expect(names.sort()).toEqual(["a", "b"]);
	});

	it("handles init failure — plugin not registered", async () => {
		const badPlugin: Plugin = {
			async init() {
				throw new Error("init exploded");
			},
			async destroy() {},
		};

		await expect(
			registry.register("bad", badPlugin, { logger: console as any, config: {}, callLLM: async () => ({ text: "", model: "" }), scheduleCron: () => {} }),
		).rejects.toThrow("init exploded");
		expect(registry.get("bad")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/plugin-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement plugin-loader.ts**

`packages/gateway/src/plugin-loader.ts`:
```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { validateManifest } from "@ebsclaw/plugin-api";
import type { PluginManifest, Plugin } from "@ebsclaw/plugin-api";
import type { LoadedPlugin } from "./types";

export class PluginLoader {
	async load(dir: string): Promise<LoadedPlugin> {
		const manifestPath = join(dir, "ebsclaw.manifest.json");
		if (!existsSync(manifestPath)) {
			throw new Error(`No manifest found at ${manifestPath}`);
		}

		const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		validateManifest(rawManifest);
		const manifest = rawManifest as PluginManifest;

		// Dynamic import of the plugin's index.ts
		const indexPath = join(dir, "index.ts");
		const module = await import(indexPath);
		const instance: Plugin = module.default ?? module;

		if (typeof instance.init !== "function" || typeof instance.destroy !== "function") {
			throw new Error(`Plugin ${manifest.name} must implement init() and destroy()`);
		}

		return { name: manifest.name, manifest, instance, dir };
	}
}
```

- [ ] **Step 4: Implement plugin-registry.ts**

`packages/gateway/src/plugin-registry.ts`:
```typescript
import type { Plugin, PluginContext } from "@ebsclaw/plugin-api";

interface RegisteredPlugin {
	name: string;
	instance: Plugin;
}

export class PluginRegistry {
	private plugins: Map<string, RegisteredPlugin> = new Map();

	async register(name: string, plugin: Plugin, ctx: PluginContext): Promise<void> {
		try {
			await plugin.init(ctx);
			this.plugins.set(name, { name, instance: plugin });
		} catch (err) {
			// Init failure — do not register
			throw err;
		}
	}

	async unregister(name: string): Promise<void> {
		const entry = this.plugins.get(name);
		if (entry) {
			await entry.instance.destroy();
			this.plugins.delete(name);
		}
	}

	get(name: string): RegisteredPlugin | undefined {
		return this.plugins.get(name);
	}

	list(): RegisteredPlugin[] {
		return Array.from(this.plugins.values());
	}
}
```

- [ ] **Step 5: Run plugin registry tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/plugin-registry.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/plugin-loader.ts packages/gateway/src/plugin-registry.ts packages/gateway/test/plugin-registry.test.ts
git commit -m "feat(gateway): add PluginLoader and PluginRegistry with lifecycle management"
```

---

### Task 7: Gateway Class — Orchestrator with Embedded Mode

**Files:**
- Create: `packages/gateway/src/index.ts`
- Test: `packages/gateway/test/gateway.test.ts`

- [ ] **Step 1: Write failing gateway test**

`packages/gateway/test/gateway.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Gateway } from "@ebsclaw/gateway";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import type { InboundMessage, OutboundMessage } from "@ebsclaw/plugin-api";

const tmpDir = join(import.meta.dir, "__tmp_gateway__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("Gateway", () => {
	it("initializes in embedded mode with all subsystems", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();
		expect(gw.mode).toBe("embedded");
		expect(gw.sessionManager).toBeDefined();
		expect(gw.pluginRegistry).toBeDefined();
		expect(gw.hookEngine).toBeDefined();
		expect(gw.cronScheduler).toBeDefined();
		expect(gw.heartbeatSystem).toBeDefined();
		await gw.shutdown();
	});

	it("processes an inbound message through hook pipeline", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		const msg: InboundMessage = {
			id: "msg-1",
			channelId: "test-channel",
			userId: "user-1",
			content: "hello",
			timestamp: Date.now(),
		};

		const processed = await gw.ingress(msg);
		expect(processed).toBeDefined();
		expect((processed as any).id).toBe("msg-1");
		await gw.shutdown();
	});

	it("egress sends message through hook pipeline", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		const msg: OutboundMessage = {
			content: "world",
		};

		const processed = await gw.egress(msg);
		expect(processed).toBeDefined();
		expect((processed as any).content).toBe("world");
		await gw.shutdown();
	});

	it("shutdown destroys all registered plugins", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		let destroyed = false;
		const plugin = {
			async init() {},
			async destroy() {
				destroyed = true;
			},
		};

		await gw.pluginRegistry.register("test-p", plugin, gw.createPluginContext("test-p", {}));
		await gw.shutdown();
		expect(destroyed).toBe(true);
	});

	it("createPluginContext returns a valid PluginContext", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		const ctx = gw.createPluginContext("my-plugin", { key: "val" });
		expect(ctx.logger).toBeDefined();
		expect(ctx.config).toEqual({ key: "val" });
		expect(typeof ctx.callLLM).toBe("function");
		expect(typeof ctx.scheduleCron).toBe("function");
		await gw.shutdown();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/gateway.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement index.ts (Gateway class)**

`packages/gateway/src/index.ts`:
```typescript
import { SessionManager } from "./session-manager";
import { PluginRegistry } from "./plugin-registry";
import { HookEngine } from "./hook-engine";
import { CronScheduler } from "./cron-scheduler";
import { HeartbeatSystem } from "./heartbeat";
import { loadConfig } from "./config";
import type { GatewayMode, GatewayConfig } from "./types";
import type { PluginContext, PluginConfig, LLMRequest, LLMResponse, LLMOptions, InboundMessage, OutboundMessage } from "@ebsclaw/plugin-api";
import { createStructuredLogger } from "@ebsclaw/shared";

export interface GatewayOptions {
	dataDir: string;
	mode?: GatewayMode;
	configPath?: string;
}

export class Gateway {
	public mode: GatewayMode;
	public sessionManager: SessionManager;
	public pluginRegistry: PluginRegistry;
	public hookEngine: HookEngine;
	public cronScheduler: CronScheduler;
	public heartbeatSystem: HeartbeatSystem;
	private config: GatewayConfig;
	private dataDir: string;

	constructor(opts: GatewayOptions) {
		this.dataDir = opts.dataDir;
		this.mode = opts.mode ?? "embedded";
		this.sessionManager = new SessionManager(opts.dataDir);
		this.pluginRegistry = new PluginRegistry();
		this.hookEngine = new HookEngine();
		this.cronScheduler = new CronScheduler();
		this.heartbeatSystem = new HeartbeatSystem(30000);
		this.config = undefined as unknown as GatewayConfig;
	}

	async init(): Promise<void> {
		const defaultConfigPath = this.dataDir + "/../config.yaml";
		this.config = await loadConfig(defaultConfigPath);

		// Wire hook engine error handler to structured logging
		this.hookEngine.onError = (pluginName, error) => {
			const logger = createStructuredLogger("gateway");
			logger.warn(`Hook failure in plugin ${pluginName}`, { error: error.message });
		};

		// Register gateway health checks
		this.heartbeatSystem.register("gateway", async () => ({
			alive: true,
			latencyMs: 0,
			details: { mode: this.mode, uptime: process.uptime() },
		}));
	}

	async ingress(msg: InboundMessage): Promise<InboundMessage> {
		const processed = await this.hookEngine.fire("pre_ingress", msg);
		return processed as InboundMessage;
	}

	async egress(msg: OutboundMessage): Promise<OutboundMessage> {
		const processed = await this.hookEngine.fire("pre_egress", msg);
		return processed as OutboundMessage;
	}

	createPluginContext(pluginName: string, config: PluginConfig): PluginContext {
		const logger = createStructuredLogger(pluginName);
		return {
			logger,
			config,
			callLLM: async (req: LLMRequest, _opts?: LLMOptions): Promise<LLMResponse> => {
				// v1 stub: will be wired to AgentRuntimeHost in Phase 2
				logger.warn("callLLM called but AgentRuntime is not yet connected", { model: req.model });
				return { text: `[stub] callLLM not connected to AgentRuntime`, model: req.model ?? "stub" };
			},
			scheduleCron: (spec: string, handler: () => Promise<void>): void => {
				this.cronScheduler.register(`${pluginName}-cron-${Date.now()}`, spec, handler, {
					jitterMs: 1000,
					minIntervalMs: 0,
					pluginName,
				});
			},
		};
	}

	async shutdown(): Promise<void> {
		this.heartbeatSystem.stop();
		this.cronScheduler.stopAll();

		// Destroy all registered plugins
		for (const plugin of this.pluginRegistry.list()) {
			try {
				await this.pluginRegistry.unregister(plugin.name);
			} catch {
				// Best-effort cleanup
			}
		}
	}
}

// Re-export internal modules for direct import
export { SessionManager } from "./session-manager";
export { PluginRegistry } from "./plugin-registry";
export { PluginLoader } from "./plugin-loader";
export { HookEngine } from "./hook-engine";
export { CronScheduler } from "./cron-scheduler";
export { HeartbeatSystem } from "./heartbeat";
export { loadConfig, DEFAULT_CONFIG } from "./config";
export type { GatewayConfig, GatewayMode, HookPoint, HookFunction, HookRegistration, LoadedPlugin, CronEntry, HealthCheck, HealthStatus } from "./types";
```

- [ ] **Step 4: Update gateway tsconfig.json to include test dir**

`packages/gateway/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Run gateway tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/gateway.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Run ALL gateway tests together**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/index.ts packages/gateway/tsconfig.json packages/gateway/test/gateway.test.ts
git commit -m "feat(gateway): add Gateway class with embedded mode, ingress/egress pipeline, and plugin context"
```

---

### Task 8: QQbot Channel Plugin — QQ API Client + ChannelPlugin Implementation

**Files:**
- Create: `extensions/channels/qqbot/src/types.ts`
- Create: `extensions/channels/qqbot/src/qq-api.ts`
- Create: `extensions/channels/qqbot/src/index.ts`
- Test: `extensions/channels/qqbot/test/qq-api.test.ts`
- Test: `extensions/channels/qqbot/test/index.test.ts`
- Modify: `extensions/channels/qqbot/package.json` (add deps + scripts)

- [ ] **Step 1: Update qqbot package.json**

`extensions/channels/qqbot/package.json`:
```json
{
  "name": "@ebsclaw/channel-qqbot",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "ebsclaw": { "type": "channel", "manifest": "ebsclaw.manifest.json" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {},
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Add a tsconfig.json at `extensions/channels/qqbot/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src", "test"]
}
```

Run: `cd /mnt/d/ebsclaw && bun install`
Expected: workspace links resolved

- [ ] **Step 2: Write failing qq-api test**

`extensions/channels/qqbot/test/qq-api.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { QQBotApiClient } from "@ebsclaw/channel-qqbot/qq-api";

describe("QQBotApiClient", () => {
	it("constructs with appId and appSecret", () => {
		const client = new QQBotApiClient({ appId: "123", appSecret: "secret" });
		expect(client.appId).toBe("123");
	});

	it("formatMessage builds text message payload", () => {
		const client = new QQBotApiClient({ appId: "123", appSecret: "secret" });
		const payload = client.formatMessage("channel-1", "hello world");
		expect(payload.content).toBe("hello world");
		expect(payload.msg_type).toBe(0);
		expect(payload.channel_id).toBe("channel-1");
	});

	it("formatMessage builds markdown message when markdown flag set", () => {
		const client = new QQBotApiClient({ appId: "123", appSecret: "secret" });
		const payload = client.formatMessage("ch-1", "**bold**", { markdown: true });
		expect(payload.msg_type).toBe(2);
		expect(payload.markdown).toBeDefined();
		expect(payload.markdown.content).toBe("**bold**");
	});

	it("parseInboundMessage extracts InboundMessage from QQ event", () => {
		const client = new QQBotApiClient({ appId: "123", appSecret: "secret" });
		const qqEvent = {
			id: "evt-1",
			type: 0,
			d: {
				id: "msg-1",
				channel_id: "ch-1",
				author: { user_openid: "user-1" },
				content: "hi there",
				timestamp: "2026-05-21T10:00:00Z",
			},
		};
		const parsed = client.parseInboundMessage(qqEvent);
		expect(parsed.id).toBe("msg-1");
		expect(parsed.channelId).toBe("ch-1");
		expect(parsed.userId).toBe("user-1");
		expect(parsed.content).toBe("hi there");
		expect(typeof parsed.timestamp).toBe("number");
	});

	it("parseInboundMessage returns null on invalid event", () => {
		const client = new QQBotApiClient({ appId: "123", appSecret: "secret" });
		const result = client.parseInboundMessage(null);
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test extensions/channels/qqbot/test/qq-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement QQ-specific types**

`extensions/channels/qqbot/src/types.ts`:
```typescript
/** QQ Bot API message types */
export interface QQMessagePayload {
	content: string;
	msg_type: number;
	channel_id: string;
	msg_id?: string;
	event_id?: string;
	markdown?: { content: string };
	embed?: unknown;
	image?: string;
	message_reference?: unknown;
}

/** QQ Bot API event data structure */
export interface QQEvent {
	id: string;
	type: number;
	opcode?: number;
	d: {
		id: string;
		channel_id: string;
		guild_id?: string;
		author: {
			user_openid: string;
			username?: string;
		};
		content: string;
		timestamp: string;
		attachments?: Array<{
			content_type: string;
			filename: string;
			height?: number;
			width?: number;
			id: string;
			size?: number;
			url: string;
		}>;
	};
}

/** QQ Bot API auth response */
export interface QQAuthResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

/** QQ Bot API client config */
export interface QQBotApiConfig {
	appId: string;
	appSecret: string;
	baseUrl?: string;
}
```

- [ ] **Step 5: Implement qq-api.ts**

`extensions/channels/qqbot/src/qq-api.ts`:
```typescript
import type { InboundMessage } from "@ebsclaw/plugin-api";
import type { QQBotApiConfig, QQMessagePayload, QQEvent, QQAuthResponse } from "./types";

export class QQBotApiClient {
	public readonly appId: string;
	private readonly appSecret: string;
	private readonly baseUrl: string;
	private accessToken: string | null = null;
	private tokenExpiresAt = 0;

	constructor(config: QQBotApiConfig) {
		this.appId = config.appId;
		this.appSecret = config.appSecret;
		this.baseUrl = config.baseUrl ?? "https://api.sgroup.qq.com";
	}

	/** Authenticate with QQ Bot API */
	async authenticate(): Promise<void> {
		const res = await fetch(`${this.baseUrl}/app/getAppAccessToken`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				appId: this.appId,
				appSecret: this.appSecret,
			}),
		});
		if (!res.ok) {
			throw new Error(`QQ Bot auth failed: ${res.status} ${await res.text()}`);
		}
		const data = (await res.json()) as QQAuthResponse;
		this.accessToken = data.access_token;
		this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
	}

	/** Ensure token is valid before making API calls */
	private async ensureAuth(): Promise<void> {
		if (!this.accessToken || Date.now() >= this.tokenExpiresAt - 60000) {
			await this.authenticate();
		}
	}

	/** Send a message to a channel */
	async send(channelId: string, content: string, options?: { markdown?: boolean; msgId?: string }): Promise<void> {
		await this.ensureAuth();
		const payload = this.formatMessage(channelId, content, options);
		const res = await fetch(`${this.baseUrl}/channels/${channelId}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `QQBot ${this.accessToken}`,
			},
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			throw new Error(`QQ Bot send failed: ${res.status} ${await res.text()}`);
		}
	}

	/** Build message payload for QQ API */
	formatMessage(channelId: string, content: string, options?: { markdown?: boolean }): QQMessagePayload {
		const isMarkdown = options?.markdown ?? false;
		const payload: QQMessagePayload = {
			content,
			msg_type: isMarkdown ? 2 : 0,
			channel_id: channelId,
		};
		if (isMarkdown) {
			payload.markdown = { content };
		}
		return payload;
	}

	/** Parse a QQ event into the standard InboundMessage format */
	parseInboundMessage(event: unknown): InboundMessage | null {
		if (!event || typeof event !== "object") return null;
		const evt = event as QQEvent;
		if (!evt.d?.id || !evt.d?.channel_id || !evt.d?.author?.user_openid) return null;

		return {
			id: evt.d.id,
			channelId: evt.d.channel_id,
			userId: evt.d.author.user_openid,
			content: evt.d.content ?? "",
			timestamp: new Date(evt.d.timestamp).getTime(),
			attachments: evt.d.attachments?.map((a) => ({
				type: a.content_type.startsWith("image/") ? "image" as const : "file" as const,
				url: a.url,
				filename: a.filename,
				mimeType: a.content_type,
			})),
		};
	}
}
```

- [ ] **Step 6: Run qq-api tests**

Run: `cd /mnt/d/ebsclaw && bun test extensions/channels/qqbot/test/qq-api.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Write failing channel plugin test**

`extensions/channels/qqbot/test/index.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { createQQBotChannelPlugin } from "@ebsclaw/channel-qqbot";
import type { ChannelPlugin, PluginContext } from "@ebsclaw/plugin-api";

describe("QQBot ChannelPlugin", () => {
	it("creates a ChannelPlugin with onMessage and send", () => {
		const plugin = createQQBotChannelPlugin({ appId: "123", appSecret: "secret" });
		expect(typeof plugin.init).toBe("function");
		expect(typeof plugin.destroy).toBe("function");
		expect(typeof plugin.onMessage).toBe("function");
		expect(typeof plugin.send).toBe("function");
	});

	it("init creates a valid plugin instance", async () => {
		const plugin = createQQBotChannelPlugin({ appId: "123", appSecret: "secret" });
		const logs: string[] = [];
		const ctx: PluginContext = {
			logger: {
				debug: (msg: string) => logs.push(`debug:${msg}`),
				info: (msg: string) => logs.push(`info:${msg}`),
				warn: (msg: string) => logs.push(`warn:${msg}`),
				error: (msg: string) => logs.push(`error:${msg}`),
			},
			config: { appId: "123", appSecret: "secret" },
			callLLM: async () => ({ text: "", model: "" }),
			scheduleCron: () => {},
		};
		await plugin.init(ctx);
		expect(logs.some((l) => l.includes("info:") && l.includes("qqbot"))).toBe(true);
		await plugin.destroy();
	});

	it("onMessage processes inbound message and calls gateway", async () => {
		const plugin = createQQBotChannelPlugin({ appId: "123", appSecret: "secret" });
		const received: unknown[] = [];
		const ctx: PluginContext = {
			logger: {
				debug: () => {},
				info: (msg: string) => {},
				warn: () => {},
				error: () => {},
			},
			config: { appId: "123", appSecret: "secret" },
			callLLM: async () => ({ text: "", model: "" }),
			scheduleCron: () => {},
		};
		await plugin.init(ctx);

		// onMessage receives an InboundMessage
		await plugin.onMessage({
			id: "m1",
			channelId: "ch1",
			userId: "u1",
			content: "test message",
			timestamp: Date.now(),
		});
		await plugin.destroy();
	});

	it("destroy cleans up resources", async () => {
		const plugin = createQQBotChannelPlugin({ appId: "123", appSecret: "secret" });
		const logs: string[] = [];
		const ctx: PluginContext = {
			logger: {
				debug: () => {},
				info: (msg: string) => logs.push(msg),
				warn: () => {},
				error: () => {},
			},
			config: {},
			callLLM: async () => ({ text: "", model: "" }),
			scheduleCron: () => {},
		};
		await plugin.init(ctx);
		await plugin.destroy();
		expect(logs.some((l) => l.includes("destroy"))).toBe(true);
	});
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test extensions/channels/qqbot/test/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 9: Implement QQbot ChannelPlugin**

`extensions/channels/qqbot/src/index.ts`:
```typescript
import type { ChannelPlugin, PluginContext, InboundMessage, OutboundMessage } from "@ebsclaw/plugin-api";
import { QQBotApiClient } from "./qq-api";
import type { QQBotApiConfig } from "./types";

export interface QQBotChannelConfig {
	appId: string;
	appSecret: string;
}

export function createQQBotChannelPlugin(config: QQBotChannelConfig): ChannelPlugin {
	let client: QQBotApiClient;
	let ctx: PluginContext;

	const plugin: ChannelPlugin = {
		async init(pluginCtx: PluginContext): Promise<void> {
			ctx = pluginCtx;
			client = new QQBotApiClient({
				appId: config.appId,
				appSecret: config.appSecret,
			});
			ctx.logger.info("qqbot channel plugin initialized", { appId: config.appId });
		},

		async destroy(): Promise<void> {
			ctx?.logger?.info("qqbot channel plugin destroyed");
		},

		async onMessage(msg: InboundMessage): Promise<void> {
			ctx?.logger?.info("qqbot received message", { msgId: msg.id, userId: msg.userId });
			// In a full implementation, this would route the message to the agent runtime
			// and then call send() with the response. For Phase 1, we log and acknowledge.
		},

		async send(channelId: string, msg: OutboundMessage): Promise<void> {
			ctx?.logger?.info("qqbot sending message", { channelId, contentLen: msg.content.length });
			await client.send(channelId, msg.content, { markdown: false });
		},
	};

	return plugin;
}

export { QQBotApiClient } from "./qq-api";
export type { QQBotApiConfig, QQEvent, QQMessagePayload, QQAuthResponse } from "./types";
```

- [ ] **Step 10: Run all qqbot tests**

Run: `cd /mnt/d/ebsclaw && bun test extensions/channels/qqbot/`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add extensions/channels/qqbot/
git commit -m "feat(qqbot): add QQ Bot API client and ChannelPlugin implementation"
```

---

### Task 9: CLI Package — gateway start + tui Commands

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/gateway-start.ts`
- Create: `packages/cli/src/commands/tui.ts`
- Test: `packages/cli/test/commands.test.ts`

- [ ] **Step 1: Create CLI package.json**

`packages/cli/package.json`:
```json
{
  "name": "@ebsclaw/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "ebsclaw": "src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@ebsclaw/gateway": "workspace:*"
  },
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src", "test"]
}
```

Run: `cd /mnt/d/ebsclaw && bun install`
Expected: workspace links resolved

- [ ] **Step 2: Write failing CLI test**

`packages/cli/test/commands.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { parseArgs } from "@ebsclaw/cli";

describe("CLI argument parsing", () => {
	it("parses 'gateway start' command", () => {
		const result = parseArgs(["gateway", "start"]);
		expect(result.command).toBe("gateway");
		expect(result.subcommand).toBe("start");
	});

	it("parses 'tui' command (default)", () => {
		const result = parseArgs(["tui"]);
		expect(result.command).toBe("tui");
		expect(result.subcommand).toBeUndefined();
	});

	it("parses 'tui --mode gateway'", () => {
		const result = parseArgs(["tui", "--mode", "gateway"]);
		expect(result.command).toBe("tui");
		expect(result.mode).toBe("gateway");
	});

	it("returns help for unknown command", () => {
		const result = parseArgs(["unknown"]);
		expect(result.command).toBe("help");
	});

	it("parses 'gateway start --port 9090'", () => {
		const result = parseArgs(["gateway", "start", "--port", "9090"]);
		expect(result.command).toBe("gateway");
		expect(result.subcommand).toBe("start");
		expect(result.port).toBe(9090);
	});

	it("parses no args as tui default", () => {
		const result = parseArgs([]);
		expect(result.command).toBe("tui");
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/cli/test/commands.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement gateway-start command**

`packages/cli/src/commands/gateway-start.ts`:
```typescript
import { Gateway } from "@ebsclaw/gateway";
import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface GatewayStartOptions {
	port?: number;
	dataDir?: string;
}

export async function gatewayStart(opts: GatewayStartOptions = {}): Promise<Gateway> {
	const dataDir = opts.dataDir ?? join(homedir(), ".ebsclaw", "data");
	mkdirSync(dataDir, { recursive: true });

	const gw = new Gateway({
		dataDir,
		mode: "daemon",
	});
	await gw.init();

	console.log(`Gateway daemon started (data: ${dataDir})`);
	return gw;
}
```

- [ ] **Step 5: Implement tui command**

`packages/cli/src/commands/tui.ts`:
```typescript
import { Gateway } from "@ebsclaw/gateway";
import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { GatewayMode } from "@ebsclaw/gateway";

export interface TuiOptions {
	mode?: GatewayMode;
	dataDir?: string;
}

export async function tui(opts: TuiOptions = {}): Promise<Gateway> {
	const mode = opts.mode ?? "embedded";
	const dataDir = opts.dataDir ?? join(homedir(), ".ebsclaw", "data");
	mkdirSync(dataDir, { recursive: true });

	const gw = new Gateway({
		dataDir,
		mode,
	});
	await gw.init();

	console.log(`TUI started in ${mode} mode (data: ${dataDir})`);
	// ink rendering will be wired here in Phase 2
	return gw;
}
```

- [ ] **Step 6: Implement CLI entry point with arg parsing**

`packages/cli/src/index.ts`:
```typescript
import { gatewayStart } from "./commands/gateway-start";
import { tui } from "./commands/tui";

export interface ParsedArgs {
	command: string;
	subcommand?: string;
	mode?: string;
	port?: number;
	dataDir?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2); // strip bun/ebsclaw

	if (args.length === 0) {
		return { command: "tui" };
	}

	const command = args[0];

	if (command === "gateway") {
		const subcommand = args[1];
		const result: ParsedArgs = { command, subcommand };

		for (let i = 2; i < args.length; i++) {
			if (args[i] === "--port" && args[i + 1]) {
				result.port = Number(args[i + 1]);
				i++;
			}
			if (args[i] === "--data-dir" && args[i + 1]) {
				result.dataDir = args[i + 1];
				i++;
			}
		}
		return result;
	}

	if (command === "tui") {
		const result: ParsedArgs = { command };
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--mode" && args[i + 1]) {
				result.mode = args[i + 1];
				i++;
			}
			if (args[i] === "--data-dir" && args[i + 1]) {
				result.dataDir = args[i + 1];
				i++;
			}
		}
		return result;
	}

	if (command === "--help" || command === "-h" || command === "help") {
		return { command: "help" };
	}

	return { command: "help" };
}

export async function main(): Promise<void> {
	const parsed = parseArgs(process.argv);

	switch (parsed.command) {
		case "gateway": {
			if (parsed.subcommand === "start") {
				const gw = await gatewayStart({ port: parsed.port, dataDir: parsed.dataDir });
				// Keep daemon alive
				process.on("SIGINT", async () => {
					await gw.shutdown();
					process.exit(0);
				});
				return;
			}
			console.log("Usage: ebsclaw gateway start [--port 8765]");
			return;
		}
		case "tui": {
			const gw = await tui({ mode: parsed.mode as any, dataDir: parsed.dataDir });
			process.on("SIGINT", async () => {
				await gw.shutdown();
				process.exit(0);
			});
			return;
		}
		case "help":
		default: {
			console.log(`ebsclaw — AI agent platform

Usage:
  ebsclaw tui [--mode embedded|gateway]   Start TUI (default: embedded)
  ebsclaw gateway start [--port 8765]      Start Gateway daemon
  ebsclaw help                             Show this help`);
		}
	}
}

// Auto-run when executed directly
if (import.meta.main) {
	main().catch((err) => {
		console.error("Fatal:", err);
		process.exit(1);
	});
}

export { gatewayStart } from "./commands/gateway-start";
export { tui } from "./commands/tui";
```

- [ ] **Step 7: Run CLI tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/cli/test/commands.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add CLI with gateway start, tui, and argument parsing"
```

---

### Task 10: End-to-End Integration — QQ Message Flow Through Gateway

**Files:**
- Test: `packages/gateway/test/integration.test.ts`

- [ ] **Step 1: Write failing integration test**

`packages/gateway/test/integration.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Gateway } from "@ebsclaw/gateway";
import { createQQBotChannelPlugin } from "@ebsclaw/channel-qqbot";
import type { InboundMessage, OutboundMessage } from "@ebsclaw/plugin-api";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const tmpDir = join(import.meta.dir, "__tmp_integration__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("End-to-end QQ message flow", () => {
	it("receives QQ message through ingress hook pipeline", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		// Register a pre_ingress hook that tags the message
		let hookReceived: unknown = null;
		gw.hookEngine.register("pre_ingress", "test-hook", async (payload) => {
			hookReceived = payload;
			return { ...payload, hookTag: "processed" };
		}, 0);

		// Simulate a QQ inbound message
		const msg: InboundMessage = {
			id: "qq-msg-1",
			channelId: "qq-ch-1",
			userId: "qq-user-1",
			content: "hello from QQ",
			timestamp: Date.now(),
		};

		const result = await gw.ingress(msg);
		expect((result as any).hookTag).toBe("processed");
		expect(hookReceived).toBeDefined();

		await gw.shutdown();
	});

	it("QQbot plugin integrates with Gateway registry", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		const qqPlugin = createQQBotChannelPlugin({
			appId: "test-app",
			appSecret: "test-secret",
		});

		await gw.pluginRegistry.register("qqbot", qqPlugin, gw.createPluginContext("qqbot", { appId: "test-app", appSecret: "test-secret" }));

		const registered = gw.pluginRegistry.get("qqbot");
		expect(registered).toBeDefined();
		expect(registered!.name).toBe("qqbot");

		await gw.shutdown();
	});

	it("session is created and persisted during message flow", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		// Create a session
		const session = await gw.sessionManager.create("sess-e2e");
		expect(session.id).toBe("sess-e2e");

		// Update session with a message
		await gw.sessionManager.update("sess-e2e", (snap) => {
			snap.messages.push({ role: "user", content: "hello" });
			return snap;
		});

		// Verify persistence by reading fresh
		const loaded = await gw.sessionManager.get("sess-e2e");
		expect(loaded).toBeDefined();
		expect(loaded!.messages.length).toBe(1);

		await gw.shutdown();
	});

	it("egress hook modifies outgoing message", async () => {
		const gw = new Gateway({
			dataDir: tmpDir,
			mode: "embedded",
		});
		await gw.init();

		gw.hookEngine.register("pre_egress", "egress-hook", async (payload) => {
			return { ...payload, disclaimer: "AI-generated" };
		}, 0);

		const msg: OutboundMessage = { content: "response text" };
		const result = await gw.egress(msg);
		expect((result as any).disclaimer).toBe("AI-generated");

		await gw.shutdown();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/integration.test.ts`
Expected: FAIL — qqbot module path not resolving

- [ ] **Step 3: Add path aliases for clean imports in test**

Update `packages/gateway/package.json` to add exports map:

`packages/gateway/package.json`:
```json
{
  "name": "@ebsclaw/gateway",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./config": "./src/config.ts",
    "./session-manager": "./src/session-manager.ts",
    "./hook-engine": "./src/hook-engine.ts",
    "./cron-scheduler": "./src/cron-scheduler.ts",
    "./heartbeat": "./src/heartbeat.ts",
    "./plugin-registry": "./src/plugin-registry.ts",
    "./plugin-loader": "./src/plugin-loader.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Similarly, update `extensions/channels/qqbot/package.json` exports:

`extensions/channels/qqbot/package.json`:
```json
{
  "name": "@ebsclaw/channel-qqbot",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./qq-api": "./src/qq-api.ts",
    "./types": "./src/types.ts"
  },
  "ebsclaw": { "type": "channel", "manifest": "ebsclaw.manifest.json" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {},
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Also update `packages/cli/package.json` with exports:

`packages/cli/package.json`:
```json
{
  "name": "@ebsclaw/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "bin": {
    "ebsclaw": "src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@ebsclaw/gateway": "workspace:*"
  },
  "devDependencies": {
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Run: `cd /mnt/d/ebsclaw && bun install`
Expected: all workspaces resolved

- [ ] **Step 4: Run integration test**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/integration.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/package.json packages/gateway/test/integration.test.ts extensions/channels/qqbot/package.json packages/cli/package.json bun.lock
git commit -m "test(gateway): add end-to-end integration test for QQ message flow through Gateway"
```

---

### Task 11: Auth + Trust Model (v1: trust all, API key mask in TUI)

**Files:**
- Create: `packages/gateway/src/auth.ts`
- Test: `packages/gateway/test/auth.test.ts`

- [ ] **Step 1: Write failing auth test**

`packages/gateway/test/auth.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { AuthSystem } from "@ebsclaw/gateway/auth";

describe("AuthSystem (v1)", () => {
	it("trusts all plugins when trustAll is true", async () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.isTrusted("any-plugin")).toBe(true);
		expect(auth.isTrusted("unknown-plugin")).toBe(true);
	});

	it("does not trust plugins when trustAll is false and no explicit trust list", async () => {
		const auth = new AuthSystem({ trustAll: false, trustedPlugins: [] });
		expect(auth.isTrusted("any-plugin")).toBe(false);
	});

	it("trusts explicitly listed plugins when trustAll is false", async () => {
		const auth = new AuthSystem({ trustAll: false, trustedPlugins: ["qqbot", "memory-core"] });
		expect(auth.isTrusted("qqbot")).toBe(true);
		expect(auth.isTrusted("memory-core")).toBe(true);
		expect(auth.isTrusted("other")).toBe(false);
	});

	it("maskApiKey hides keys matching known patterns", () => {
		const auth = new AuthSystem({ trustAll: true });
		expect(auth.maskApiKey("sk-ant-1234567890abcdefghijklmn")).toBe("sk-ant-...klmn");
		expect(auth.maskApiKey("sk-proj-1234567890abcdefghijklmn")).toBe("sk-proj-...klmn");
		expect(auth.maskApiKey("key-1234567890abcdefghijklmn")).toBe("key-...klmn");
		expect(auth.maskApiKey("short")).toBe("short");
		expect(auth.maskApiKey("")).toBe("");
	});

	it("maskApiKey handles config values", () => {
		const auth = new AuthSystem({ trustAll: true });
		const config = {
			apiKey: "sk-ant-1234567890abcdefghijklmn",
			name: "test",
			port: 8080,
		};
		const masked = auth.maskConfigValues(config);
		expect(masked.apiKey).toBe("sk-ant-...klmn");
		expect(masked.name).toBe("test");
		expect(masked.port).toBe(8080);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auth.ts**

`packages/gateway/src/auth.ts`:
```typescript
export interface AuthConfig {
	trustAll: boolean;
	trustedPlugins?: string[];
}

const KEY_PATTERNS = [
	/sk-ant-[a-zA-Z0-9]{8,}/,
	/sk-proj-[a-zA-Z0-9]{8,}/,
	/sk-[a-zA-Z0-9]{8,}/,
	/key-[a-zA-Z0-9]{8,}/,
];

export class AuthSystem {
	private trustAll: boolean;
	private trustedPlugins: Set<string>;

	constructor(config: AuthConfig) {
		this.trustAll = config.trustAll;
		this.trustedPlugins = new Set(config.trustedPlugins ?? []);
	}

	isTrusted(pluginName: string): boolean {
		if (this.trustAll) return true;
		return this.trustedPlugins.has(pluginName);
	}

	maskApiKey(value: string): string {
		if (value.length <= 8) return value;
		for (const pattern of KEY_PATTERNS) {
			if (pattern.test(value)) {
				const prefix = value.slice(0, value.length - 4);
				const suffix = value.slice(-4);
				return `${prefix.slice(0, 7)}...${suffix}`;
			}
		}
		return value;
	}

	maskConfigValues(config: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(config)) {
			if (typeof value === "string") {
				result[key] = this.maskApiKey(value);
			} else {
				result[key] = value;
			}
		}
		return result;
	}
}
```

- [ ] **Step 4: Add auth export to gateway index.ts**

Add the following to the re-exports in `packages/gateway/src/index.ts`:
```typescript
export { AuthSystem } from "./auth";
export type { AuthConfig } from "./auth";
```

- [ ] **Step 5: Run auth tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/test/auth.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/auth.ts packages/gateway/src/index.ts packages/gateway/test/auth.test.ts
git commit -m "feat(gateway): add v1 AuthSystem with trust-all model and API key masking"
```

---

### Task 12: Full Test Suite + Lint + Typecheck Gate

**Files:**
- Modify: `packages/gateway/src/index.ts` (ensure all exports)
- No new files — verification only

- [ ] **Step 1: Run ALL tests across the full monorepo**

Run: `cd /mnt/d/ebsclaw && bun test`
Expected: ALL PASS

- [ ] **Step 2: Run lint across the full monorepo**

Run: `cd /mnt/d/ebsclaw && bun run lint`
Expected: No errors

- [ ] **Step 3: Run typecheck across the full monorepo**

Run: `cd /mnt/d/ebsclaw && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Verify test coverage for gateway package**

Run: `cd /mnt/d/ebsclaw && bun test packages/gateway/ --coverage`
Expected: Coverage >= 80%

- [ ] **Step 5: Verify test coverage for qqbot extension**

Run: `cd /mnt/d/ebsclaw && bun test extensions/channels/qqbot/ --coverage`
Expected: Coverage >= 80%

- [ ] **Step 6: Verify CLI tests pass**

Run: `cd /mnt/d/ebsclaw && bun test packages/cli/`
Expected: ALL PASS

- [ ] **Step 7: Run a quick smoke test of the CLI entry point**

Run: `cd /mnt/d/ebsclaw && bun packages/cli/src/index.ts help`
Expected: Help text printed

- [ ] **Step 8: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore: Phase 1 complete — all tests, lint, typecheck passing"
```

---

## Spec Coverage Checklist

| Phase 1 Deliverable | Task | Artifact |
|---------------------|------|----------|
| Gateway daemon (Embedded mode) | T7 | `packages/gateway/src/index.ts` |
| Plugin Registry: load/unload/lifecycle | T6 | `packages/gateway/src/plugin-registry.ts`, `plugin-loader.ts` |
| Session Manager: CRUD + disk persistence | T2 | `packages/gateway/src/session-manager.ts` |
| Hook Engine: pre_ingress/pre_egress + isolation | T3 | `packages/gateway/src/hook-engine.ts` |
| Cron Scheduler: deterministic jitter | T4 | `packages/gateway/src/cron-scheduler.ts` |
| Heartbeat System | T5 | `packages/gateway/src/heartbeat.ts` |
| QQbot channel plugin | T8 | `extensions/channels/qqbot/src/index.ts`, `qq-api.ts`, `types.ts` |
| CLI: gateway start + tui | T9 | `packages/cli/src/index.ts`, `commands/` |
| End-to-end integration test | T10 | `packages/gateway/test/integration.test.ts` |
| Auth + Trust (v1: trustAll + key mask) | T11 | `packages/gateway/src/auth.ts` |
| Full test suite + lint + typecheck gate | T12 | Verification only |
