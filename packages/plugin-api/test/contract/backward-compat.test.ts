import { describe, it, expect } from "bun:test";
import {
	EbsclawError,
} from "../../src/index.ts";
import type {
	Plugin,
	PluginContext,
	ChannelPlugin,
	MemoryPlugin,
	SkillPlugin,
	RAGPlugin,
	InboundMessage,
	OutboundMessage,
	MemoryQuery,
	MemoryResult,
	MemoryEntry,
	MemoryType,
	SkillDescriptor,
	SkillContent,
	DocumentSource,
	RAGQuery,
	RAGResult,
	LLMRequest,
	LLMResponse,
	LLMOptions,
	PluginManifest,
	PluginPermissions,
	SessionSnapshot,
	CompactBoundary,
	ErrorCategory,
} from "../../src/index.ts";

describe("Plugin API backward compatibility", () => {
	it("Plugin interface is satisfied by minimal object", () => {
		const plugin: Plugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
		};
		expect(typeof plugin.init).toBe("function");
		expect(typeof plugin.destroy).toBe("function");
	});

	it("ChannelPlugin extends Plugin", () => {
		const channel: ChannelPlugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			async onMessage(_msg: InboundMessage) {},
			async send(_channelId: string, _msg: OutboundMessage) {},
		};
		expect(typeof channel.onMessage).toBe("function");
		expect(typeof channel.send).toBe("function");
	});

	it("MemoryPlugin extends Plugin", () => {
		const memory: MemoryPlugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			async query(_req: MemoryQuery) {
				return { entries: [] };
			},
			async store(_entry: MemoryEntry) {},
			async extractAndStore(_sessionId: string) {},
		};
		expect(typeof memory.query).toBe("function");
		expect(typeof memory.store).toBe("function");
		expect(typeof memory.extractAndStore).toBe("function");
	});

	it("SkillPlugin extends Plugin", () => {
		const skill: SkillPlugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			listSkills() {
				return [];
			},
			async loadSkill(_id: string) {
				return { id: "test", content: "" };
			},
		};
		expect(typeof skill.listSkills).toBe("function");
		expect(typeof skill.loadSkill).toBe("function");
	});

	it("RAGPlugin extends Plugin", () => {
		const rag: RAGPlugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			async indexDocuments(_source: DocumentSource) {},
			async query(_req: RAGQuery) {
				return { chunks: [] };
			},
		};
		expect(typeof rag.indexDocuments).toBe("function");
		expect(typeof rag.query).toBe("function");
	});
});

describe("Plugin API type structure", () => {
	it("InboundMessage has required fields", () => {
		const msg: InboundMessage = {
			id: "msg-1",
			channelId: "ch-1",
			userId: "user-1",
			content: "hello",
			timestamp: Date.now(),
		};
		expect(msg.id).toBe("msg-1");
		expect(msg.replyToId).toBeUndefined();
		expect(msg.attachments).toBeUndefined();
	});

	it("OutboundMessage has required fields", () => {
		const msg: OutboundMessage = {
			content: "world",
		};
		expect(msg.content).toBe("world");
		expect(msg.replyToId).toBeUndefined();
	});

	it("MemoryQuery has required text field", () => {
		const q: MemoryQuery = { text: "hello" };
		expect(q.text).toBe("hello");
		expect(q.topK).toBeUndefined();
		expect(q.type).toBeUndefined();
	});

	it("MemoryResult returns entries array", () => {
		const r: MemoryResult = {
			entries: [{ content: "test", type: "user" }],
		};
		expect(r.entries.length).toBe(1);
	});

	it("MemoryEntry has required fields", () => {
		const e: MemoryEntry = {
			content: "user prefers dark mode",
			type: "user" as MemoryType,
		};
		expect(e.scope).toBeUndefined();
		expect(e.metadata).toBeUndefined();
	});

	it("SkillDescriptor has required fields", () => {
		const d: SkillDescriptor = { id: "s1", name: "Test Skill" };
		expect(d.description).toBeUndefined();
		expect(d.tags).toBeUndefined();
	});

	it("SkillContent has required fields", () => {
		const c: SkillContent = { id: "s1", content: "do stuff" };
		expect(c.metadata).toBeUndefined();
	});

	it("DocumentSource has required fields", () => {
		const s: DocumentSource = { type: "file", path: "/docs" };
		expect(s.recursive).toBeUndefined();
		expect(s.filePatterns).toBeUndefined();
	});

	it("RAGQuery has required query field", () => {
		const q: RAGQuery = { query: "search" };
		expect(q.topK).toBeUndefined();
	});

	it("RAGResult returns chunks array", () => {
		const r: RAGResult = {
			chunks: [{ content: "chunk", source: "doc.md" }],
		};
		expect(r.chunks.length).toBe(1);
	});

	it("LLMRequest has required prompt field", () => {
		const req: LLMRequest = { prompt: "hello" };
		expect(req.model).toBeUndefined();
		expect(req.maxTokens).toBeUndefined();
	});

	it("LLMResponse has required text and model", () => {
		const res: LLMResponse = { text: "world", model: "claude-3" };
		expect(res.usage).toBeUndefined();
	});

	it("LLMOptions has all optional fields", () => {
		const opts: LLMOptions = {};
		expect(opts.signal).toBeUndefined();
		expect(opts.tenantId).toBeUndefined();
	});

	it("PluginManifest has required fields", () => {
		const m: PluginManifest = {
			name: "test",
			version: "0.1.0",
			type: "channel",
			permissions: { fs: [], net: [] },
		};
		expect(m.displayName).toBeUndefined();
		expect(m.status).toBeUndefined();
		expect(m.trusted).toBeUndefined();
	});

	it("SessionSnapshot has required fields", () => {
		const s: SessionSnapshot = {
			id: "s1",
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		expect(s.compactBoundary).toBeUndefined();
		expect(s.activeToolCalls).toBeUndefined();
		expect(s.tokenCount).toBeUndefined();
	});

	it("CompactBoundary has required fields", () => {
		const b: CompactBoundary = {
			index: 5,
			timestamp: Date.now(),
		};
		expect(b.summary).toBeUndefined();
	});
});

describe("Error taxonomy", () => {
	it("ErrorCategory has 4 values", () => {
		const categories: ErrorCategory[] = ["user-action", "retryable", "corrupt", "fatal"];
		expect(categories.length).toBe(4);
	});

	it("EbsclawError has required fields", () => {
		const err = new EbsclawError("test", "retryable", true);
		expect(err.message).toBe("test");
		expect(err.category).toBe("retryable");
		expect(err.recoverable).toBe(true);
	});
});
