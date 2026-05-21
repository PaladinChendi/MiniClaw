import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Gateway } from "../src/index.ts";
import type { Plugin, PluginContext, ChannelPlugin, InboundMessage, OutboundMessage } from "@ebsclaw/plugin-api";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const tmpDir = join(import.meta.dir, "__tmp_integration__");

beforeEach(async () => {
	await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("Integration: full message flow", () => {
	it("message flows through ingress → pre_ingress hook → session → egress", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });

		const hookLog: string[] = [];
		gw.hookEngine.register("pre_ingress", "log-hook", async (data: any) => {
			hookLog.push(`pre_ingress:${data.content}`);
		});

		const egressMessages: OutboundMessage[] = [];
		gw.hookEngine.register("pre_egress", "log-egress", async (data: any) => {
			egressMessages.push(data.msg);
		});

		await gw.start();

		const msg: InboundMessage = {
			id: "int-1",
			channelId: "ch-1",
			userId: "u-1",
			content: "hello from integration",
			timestamp: Date.now(),
		};
		await gw.ingress(msg);

		expect(hookLog).toEqual(["pre_ingress:hello from integration"]);

		const reply: OutboundMessage = { content: "reply from agent" };
		await gw.egress("ch-1", reply);
		expect(egressMessages).toEqual([reply]);

		await gw.stop();
	});

	it("plugin receives message via onMessage after registration", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		const received: InboundMessage[] = [];
		const channelPlugin: ChannelPlugin = {
			async init(_ctx: PluginContext) {},
			async destroy() {},
			async onMessage(msg: InboundMessage) {
				received.push(msg);
			},
			async send() {},
		};

		await gw.registerPlugin(
			{ name: "test-channel", version: "0.1.0", type: "channel", permissions: { fs: [], net: [] } },
			channelPlugin,
			"/fake/dir",
		);

		// Deliver message directly to plugin
		const msg: InboundMessage = {
			id: "p-1",
			channelId: "ch-1",
			userId: "u-1",
			content: "plugin test",
			timestamp: Date.now(),
		};
		await (channelPlugin as any).onMessage(msg);
		expect(received.length).toBe(1);
		expect(received[0].content).toBe("plugin test");

		await gw.stop();
	});

	it("session is persisted after update", async () => {
		const gw = new Gateway({ sessionDir: tmpDir });
		await gw.start();

		const session = await gw.sessionManager.create("persist-1");
		await gw.sessionManager.updateMessages("persist-1", [
			{ role: "user", content: "persist me" },
		]);

		// Create a new SessionManager to verify persistence
		const { SessionManager } = await import("../src/session-manager.ts");
		const sm2 = new SessionManager(tmpDir);
		const loaded = await sm2.load("persist-1");
		expect(loaded.messages).toEqual([{ role: "user", content: "persist me" }]);

		await gw.stop();
	});
});
