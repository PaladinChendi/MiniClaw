import type { Plugin, PluginContext } from "./plugin";

export interface MessageAttachment {
  type: "image" | "file" | "audio";
  url?: string;
  data?: Uint8Array;
  mimeType?: string;
  filename?: string;
}

export interface InboundMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  timestamp: number;
  replyToId?: string;
  attachments?: MessageAttachment[];
}

export interface OutboundMessage {
  content: string;
  replyToId?: string;
  attachments?: MessageAttachment[];
}

export interface ChannelPlugin extends Plugin {
  onMessage(msg: InboundMessage): Promise<void>;
  send(channelId: string, msg: OutboundMessage): Promise<void>;
}
