import type { ChannelPlugin, InboundMessage, OutboundMessage, PluginContext } from "@miniclaw/plugin-api";
import { QQBotAPI } from "./qq-api.ts";

type SendFn = (channelId: string, msg: OutboundMessage) => Promise<void>;

export class QQBotChannelPlugin implements ChannelPlugin {
	private ctx!: PluginContext;
	private api!: QQBotAPI;
	private messageQueue: InboundMessage[] = [];
	private sendFn: SendFn = async () => {};

	async init(ctx: PluginContext): Promise<void> {
		this.ctx = ctx;
		this.api = new QQBotAPI({
			appId: (ctx.config as any).appId ?? "",
			appSecret: (ctx.config as any).appSecret ?? "",
		});
	}

	async destroy(): Promise<void> {
		this.messageQueue = [];
	}

	async onMessage(msg: InboundMessage): Promise<void> {
		this.messageQueue.push(msg);
	}

	async send(channelId: string, msg: OutboundMessage): Promise<void> {
		await this.sendFn(channelId, msg);
	}

	setSendFn(fn: SendFn): void {
		this.sendFn = fn;
	}

	getMessageQueue(): InboundMessage[] {
		return this.messageQueue;
	}
}

export { QQBotAPI };
