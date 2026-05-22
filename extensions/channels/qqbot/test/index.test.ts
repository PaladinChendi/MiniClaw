import { describe, expect, it } from "bun:test";
import type { InboundMessage, OutboundMessage, PluginContext } from "@ebsclaw/plugin-api";
import { QQBotChannelPlugin } from "../src/index.ts";
import { QQBotAPI } from "../src/qq-api.ts";

function createMockContext(): PluginContext {
	return {
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		config: { appId: "123", appSecret: "secret", enabled: true },
		callLLM: async () => ({ text: "mock", model: "mock" }),
		scheduleCron: () => {},
		callPlugin: async () => {},
		getStore: () => ({ read: async () => null, list: async () => [] }),
	};
}

describe("QQBotAPI", () => {
	it("converts InboundMessage to QQ format", () => {
		const api = new QQBotAPI({ appId: "123", appSecret: "secret" });
		const msg: InboundMessage = {
			id: "m1",
			channelId: "ch1",
			userId: "u1",
			content: "hello",
			timestamp: Date.now(),
		};
		const qqMsg = api.toQQMessage(msg);
		expect(qqMsg.content).toBe("hello");
		expect(qqMsg.msg_type).toBe(0);
	});

	it("converts QQ message to InboundMessage", () => {
		const api = new QQBotAPI({ appId: "123", appSecret: "secret" });
		const qqMsg = {
			id: "qm1",
			channel_id: "ch1",
			author: { id: "u1" },
			content: "world",
			timestamp: "1700000000000",
		};
		const inbound = api.fromQQMessage(qqMsg);
		expect(inbound.id).toBe("qm1");
		expect(inbound.channelId).toBe("ch1");
		expect(inbound.userId).toBe("u1");
		expect(inbound.content).toBe("world");
	});
});

describe("QQBotChannelPlugin", () => {
	it("implements ChannelPlugin interface", async () => {
		const plugin = new QQBotChannelPlugin();
		const ctx = createMockContext();
		await plugin.init(ctx);
		expect(typeof plugin.onMessage).toBe("function");
		expect(typeof plugin.send).toBe("function");
		await plugin.destroy();
	});

	it("onMessage stores message for processing", async () => {
		const plugin = new QQBotChannelPlugin();
		const ctx = createMockContext();
		await plugin.init(ctx);

		const msg: InboundMessage = {
			id: "m1",
			channelId: "qq-1",
			userId: "u1",
			content: "test",
			timestamp: Date.now(),
		};
		await plugin.onMessage(msg);
		const queue = plugin.getMessageQueue();
		expect(queue.length).toBe(1);
		expect(queue[0].content).toBe("test");
		await plugin.destroy();
	});

	it("send constructs correct API call format", async () => {
		const plugin = new QQBotChannelPlugin();
		const ctx = createMockContext();
		await plugin.init(ctx);

		const sent: unknown[] = [];
		plugin.setSendFn(async (channelId, msg) => {
			sent.push({ channelId, msg });
		});

		const msg: OutboundMessage = { content: "response" };
		await plugin.send("qq-1", msg);
		expect(sent.length).toBe(1);
		expect((sent[0] as any).channelId).toBe("qq-1");
		expect((sent[0] as any).msg.content).toBe("response");
		await plugin.destroy();
	});
});
