import type { Plugin } from "./plugin";

export interface DocumentSource {
  type: "file" | "url" | "git";
  path: string;
  recursive?: boolean;
  filePatterns?: string[];
}

export interface RAGQuery {
  query: string;
  topK?: number;
  sourceType?: DocumentSource["type"];
}

export interface RAGResult {
  chunks: Array<{
    content: string;
    source: string;
    relevanceScore?: number;
  }>;
}

export interface RAGPlugin extends Plugin {
  indexDocuments(source: DocumentSource): Promise<void>;
  query(req: RAGQuery): Promise<RAGResult>;
}
