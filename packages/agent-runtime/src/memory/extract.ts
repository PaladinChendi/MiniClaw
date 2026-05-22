import type { MemoryStore } from "@ebsclaw/gateway/src/memory-store";
import type { MemoryType } from "@ebsclaw/plugin-api";
import { writeFile } from "fs/promises";
import { join } from "path";

interface ConvMessage {
	role: "user" | "assistant";
	content: string;
}

const PATTERNS: { re: RegExp; type: MemoryType }[] = [
	{ re: /\b(?:prefer|like|love|enjoy|hate|dislike|don'?t like|can't stand)\b/i, type: "user" },
	{ re: /\b(?:don'?t|never|always|must|should|avoid|no\s+\w+)\b.*\b(?:use|do|write|put|add)\b/i, type: "feedback" },
	{ re: /\b(?:building|working on|we'?re|our|project|called|named)\b/i, type: "project" },
];

export class MemoryExtractor {
	private store: MemoryStore;
	private sessionDir?: string;

	constructor(store: MemoryStore, opts?: { sessionDir?: string }) {
		this.store = store;
		this.sessionDir = opts?.sessionDir;
	}

	async extract(messages: ConvMessage[]): Promise<string[]> {
		const ids: string[] = [];
		const sessionNotes: string[] = [];

		for (const msg of messages) {
			if (msg.role !== "user") continue;
			for (const { re, type } of PATTERNS) {
				if (re.test(msg.content)) {
					const id = await this.store.create({ content: msg.content, type });
					ids.push(id);
					sessionNotes.push(msg.content);
					break;
				}
			}
		}

		if (this.sessionDir && sessionNotes.length > 0) {
			await writeFile(join(this.sessionDir, "notes.md"), sessionNotes.join("\n\n") + "\n");
		}

		return ids;
	}
}
