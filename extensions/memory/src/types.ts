import type { MemoryType } from "@ebsclaw/plugin-api";

export interface MemoryFileEntry {
	id: string;
	content: string;
	type: MemoryType;
	scope: "private" | "team";
	name: string;
	description: string;
	createdAt: number;
	updatedAt: number;
}

export interface MemoryFileFrontmatter {
	name: string;
	description: string;
	type: MemoryType;
}

export interface MemoryIndexEntry {
	filename: string;
	name: string;
	description: string;
	type: MemoryType;
}

export interface ExtractOutput {
	persistent: MemoryFileEntry[];
	session: string[];
}

export const MEMORY_DIR = "memories";
export const MEMORY_INDEX_FILE = "MEMORY.md";
export const MAX_INDEX_LINES = 200;
export const MAX_INDEX_BYTES = 25 * 1024;
