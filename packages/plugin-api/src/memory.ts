import type { Plugin } from "./plugin";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  content: string;
  type: MemoryType;
  scope?: "private" | "team";
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

export interface MemoryQuery {
  text: string;
  topK?: number;
  type?: MemoryType;
  scope?: "private" | "team";
}

export interface MemoryResult {
  entries: Array<{
    content: string;
    type: MemoryType;
    relevanceScore?: number;
  }>;
}

export interface MemoryPlugin extends Plugin {
  query(req: MemoryQuery): Promise<MemoryResult>;
  store(entry: MemoryEntry): Promise<void>;
  extractAndStore(sessionId: string): Promise<void>;
}
