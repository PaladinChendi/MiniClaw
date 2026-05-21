import { writeFileAtomic } from "@ebsclaw/shared";
import { readFile, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { SessionState } from "./types.ts";

export class SessionManager {
	private dir: string;

	constructor(dir: string) {
		this.dir = dir;
	}

	async create(id: string): Promise<SessionState> {
		const session: SessionState = {
			id,
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		await this.save(session);
		return session;
	}

	async load(id: string): Promise<SessionState> {
		const filePath = join(this.dir, `${id}.json`);
		if (!existsSync(filePath)) {
			throw new Error(`Session ${id} not found`);
		}
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content) as SessionState;
	}

	async list(): Promise<string[]> {
		if (!existsSync(this.dir)) return [];
		const files = await readdir(this.dir);
		return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
	}

	async delete(id: string): Promise<void> {
		const filePath = join(this.dir, `${id}.json`);
		if (existsSync(filePath)) {
			await unlink(filePath);
		}
	}

	async updateMessages(id: string, messages: unknown[]): Promise<void> {
		const session = await this.load(id);
		session.messages = messages;
		session.updatedAt = Date.now();
		await this.save(session);
	}

	private async save(session: SessionState): Promise<void> {
		const filePath = join(this.dir, `${session.id}.json`);
		await writeFileAtomic(filePath, JSON.stringify(session, null, 2));
	}
}
