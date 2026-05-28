import { describe, expect, it } from "bun:test";
import { StreamingEngine } from "../src/streaming-engine.ts";
import type { StreamChunk } from "../src/types.ts";

describe("StreamingEngine", () => {
	it("collects text chunks and emits at sentence boundaries", async () => {
		const engine = new StreamingEngine({ chunkSize: 50 });
		const chunks: string[] = [];

		engine.onChunk((text) => chunks.push(text));

		engine.push({ type: "text", content: "Hello world." });
		engine.push({ type: "text", content: " This is a test." });
		engine.push({ type: "text", content: " Second sentence here." });
		engine.end();

		await engine.finished();

		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks.join("")).toContain("Hello world.");
	});

	it("flushes remaining buffer on end()", async () => {
		const engine = new StreamingEngine({ chunkSize: 1000 });
		const chunks: string[] = [];

		engine.onChunk((text) => chunks.push(text));
		engine.push({ type: "text", content: "No period at end" });
		engine.end();

		await engine.finished();

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toBe("No period at end");
	});

	it("handles tool_call chunks by passing through immediately", async () => {
		const engine = new StreamingEngine({ chunkSize: 50 });
		const chunks: StreamChunk[] = [];

		engine.onRawChunk((chunk) => chunks.push(chunk));

		engine.push({ type: "tool_call", content: "", toolCall: { id: "tc1", name: "bash", arguments: "{}" } });
		engine.end();

		await engine.finished();

		expect(chunks.some((c) => c.type === "tool_call")).toBe(true);
	});

	it("applies backpressure: buffers up to limit then signals overflow", () => {
		const engine = new StreamingEngine({ chunkSize: 10, maxBuffer: 50 });
		const overflow = engine.push({ type: "text", content: "x".repeat(100) });

		expect(overflow).toBe(true);
	});

	it("fallBackToNonStreaming returns buffered text", () => {
		const engine = new StreamingEngine({ chunkSize: 100 });
		engine.push({ type: "text", content: "hello" });
		engine.push({ type: "text", content: " world" });
		const text = engine.fallBackToNonStreaming();

		expect(text).toBe("hello world");
	});
});
