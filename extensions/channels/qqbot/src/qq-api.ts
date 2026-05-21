export interface QQBotAPIConfig {
	appId: string;
	appSecret: string;
}

export interface QQMessage {
	id: string;
	channel_id: string;
	author: { id: string };
	content: string;
	timestamp: string;
}

export interface QQOutbound {
	content: string;
	msg_type: number;
}

import type { InboundMessage } from "@ebsclaw/plugin-api";

export class QQBotAPI {
	private config: QQBotAPIConfig;

	constructor(config: QQBotAPIConfig) {
		this.config = config;
	}

	toQQMessage(msg: InboundMessage): QQOutbound {
		return { content: msg.content, msg_type: 0 };
	}

	fromQQMessage(qqMsg: QQMessage): InboundMessage {
		return {
			id: qqMsg.id,
			channelId: qqMsg.channel_id,
			userId: qqMsg.author.id,
			content: qqMsg.content,
			timestamp: Number(qqMsg.timestamp),
		};
	}
}
