export interface SessionSnapshot {
  id: string;
  messages: unknown[];
  compactBoundary?: CompactBoundary;
  activeToolCalls?: unknown[];
  createdAt: number;
  updatedAt: number;
  tokenCount?: number;
}

export interface CompactBoundary {
  index: number;
  timestamp: number;
  summary?: string;
}
