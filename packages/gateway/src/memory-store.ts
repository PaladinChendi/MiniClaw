import { readFile, writeFile, mkdir, readdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { writeFileAtomic, cleanupTempFiles } from "@ebsclaw/shared";
import type { MemoryType } from "@ebsclaw/plugin-api";
import type {
	MemoryFileEntry,
	MemoryFileFrontmatter,
	MemoryIndexEntry,
} from "@ebsclaw/memory/types";
import {
	MEMORY_DIR,
	MEMORY_INDEX_FILE,
	MAX_INDEX_LINES,
	MAX_INDEX_BYTES,
} from "@ebsclaw/memory/types";

function generateId(): string {
	return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function frontmatterToYaml(fm: MemoryFileFrontmatter): string {
	return `---\nname: ${fm.name}\ndescription: ${fm.description}\ntype: ${fm.type}\n---\n`;
}

function parseFrontmatter(content: string): { frontmatter: MemoryFileFrontmatter; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) throw new Error("Invalid memory file: missing frontmatter");
	const fm: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const [key, ...rest] = line.split(":");
		if (key && rest.length) fm[key.trim()] = rest.join(":").trim();
	}
	return {
		frontmatter: {
			name: fm.name ?? "",
			description: fm.description ?? "",
			type: (fm.type as MemoryType) ?? "user",
		},
		body: match[2],
	};
}

export class MemoryStore {
	private baseDir: string;
	private memDir: string;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		this.memDir = join(baseDir, MEMORY_DIR);
	}

	async init(): Promise<void> {
		await mkdir(this.memDir, { recursive: true });
		await cleanupTempFiles(this.memDir);
		if (!existsSync(join(this.baseDir, MEMORY_INDEX_FILE))) {
			await writeFileAtomic(join(this.baseDir, MEMORY_INDEX_FILE), "");
		}
	}

	async create(data: {
		content: string;
		type: MemoryType;
		scope?: "private" | "team";
	}): Promise<string> {
		const id = generateId();
		const now = Date.now();
		const name = data.content.slice(0, 40).replace(/[^a-zA-Z0-9一-鿿-]/g, "-").slice(0, 40);
		const description = data.content.slice(0, 80);
		const fm: MemoryFileFrontmatter = { name, description, type: data.type };
		const filename = `${data.type}_${id}.md`;
		const filePath = join(this.memDir, filename);
		const fileContent = `${frontmatterToYaml(fm)}${data.content}\n`;

		const entry: MemoryFileEntry = {
			id,
			content: data.content,
			type: data.type,
			scope: data.scope ?? "private",
			name,
			description,
			createdAt: now,
			updatedAt: now,
		};

		await writeFileAtomic(filePath, fileContent);
		await this.appendToIndex(entry, filename);
		return id;
	}

	async read(id: string): Promise<MemoryFileEntry | null> {
		const files = await readdir(this.memDir);
		const match = files.find((f) => f.includes(id) && f.endsWith(".md"));
		if (!match) return null;
		const content = await readFile(join(this.memDir, match), "utf-8");
		const { frontmatter, body } = parseFrontmatter(content);
		const s = await stat(join(this.memDir, match));
		return {
			id,
			content: body.trim(),
			type: frontmatter.type,
			scope: "private",
			name: frontmatter.name,
			description: frontmatter.description,
			createdAt: s.mtimeMs,
			updatedAt: s.mtimeMs,
		};
	}

	async update(id: string, data: { content?: string }): Promise<void> {
		const files = await readdir(this.memDir);
		const match = files.find((f) => f.includes(id) && f.endsWith(".md"));
		if (!match) throw new Error(`Memory entry ${id} not found`);
		const filePath = join(this.memDir, match);
		const existing = await readFile(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter(existing);
		if (data.content !== undefined) {
			const newFm: MemoryFileFrontmatter = {
				name: data.content.slice(0, 40).replace(/[^a-zA-Z0-9一-鿿-]/g, "-").slice(0, 40),
				description: data.content.slice(0, 80),
				type: frontmatter.type,
			};
			const fileContent = `${frontmatterToYaml(newFm)}${data.content}\n`;
			await writeFileAtomic(filePath, fileContent);
			await this.rebuildIndex();
		}
	}

	async delete(id: string): Promise<void> {
		const files = await readdir(this.memDir);
		const match = files.find((f) => f.includes(id) && f.endsWith(".md"));
		if (!match) return;
		await unlink(join(this.memDir, match));
		await this.rebuildIndex();
	}

	async list(): Promise<MemoryIndexEntry[]> {
		const indexPath = join(this.baseDir, MEMORY_INDEX_FILE);
		if (!existsSync(indexPath)) return [];
		const content = await readFile(indexPath, "utf-8");
		const entries: MemoryIndexEntry[] = [];
		for (const line of content.split("\n")) {
			const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*—\s*(.+)$/);
			if (m) {
				entries.push({ filename: m[2], name: m[1], description: m[3], type: "user" });
			}
		}
		return entries;
	}

	private async appendToIndex(entry: MemoryFileEntry, filename: string): Promise<void> {
		const indexPath = join(this.baseDir, MEMORY_INDEX_FILE);
		const line = `- [${entry.name}](${MEMORY_DIR}/${filename}) — ${entry.description}\n`;
		let content = existsSync(indexPath) ? await readFile(indexPath, "utf-8") : "";
		content += line;
		const lines = content.split("\n").filter((l) => l.trim().length > 0);
		if (lines.length > MAX_INDEX_LINES) {
			content = lines.slice(0, MAX_INDEX_LINES).join("\n") + "\n";
		}
		if (Buffer.byteLength(content, "utf-8") > MAX_INDEX_BYTES) {
			content = content.slice(0, MAX_INDEX_BYTES);
		}
		await writeFileAtomic(indexPath, content);
	}

	private async rebuildIndex(): Promise<void> {
		const files = await readdir(this.memDir);
		const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
		const indexPath = join(this.baseDir, MEMORY_INDEX_FILE);
		let content = "";
		for (const file of mdFiles) {
			try {
				const fc = await readFile(join(this.memDir, file), "utf-8");
				const { frontmatter } = parseFrontmatter(fc);
				content += `- [${frontmatter.name}](${MEMORY_DIR}/${file}) — ${frontmatter.description}\n`;
			} catch {
				// skip malformed files
			}
		}
		const lines = content.split("\n").filter((l) => l.trim().length > 0);
		if (lines.length > MAX_INDEX_LINES) {
			content = lines.slice(0, MAX_INDEX_LINES).join("\n") + "\n";
		}
		await writeFileAtomic(indexPath, content);
	}
}
