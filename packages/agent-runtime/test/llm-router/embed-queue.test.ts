import { beforeEach, describe, expect, it, vi } from "bun:test";
import { EmbedQueue } from "../../src/llm-router/embed-queue.ts";

describe("EmbedQueue", () => {
	let queue: EmbedQueue;

	beforeEach(() => {
		queue = new EmbedQueue();
	});

	it("processes session_chat requests before memory_search", async () => {
		const order: string[] = [];
		const embedFn = vi.fn(async (text: string) => {
			order.push(text);
			return new Array(10).fill(0);
		});

		queue.setEmbedFn(embedFn);
		queue.startProcessing();

		queue.enqueue({
			id: "2",
			text: "memory",
			priority: "memory_search",
			resolve: () => {},
			reject: () => {},
		});
		queue.enqueue({
			id: "3",
			text: "rag",
			priority: "rag_indexing",
			resolve: () => {},
			reject: () => {},
		});
		queue.enqueue({
			id: "1",
			text: "chat",
			priority: "session_chat",
			resolve: () => {},
			reject: () => {},
		});

		await queue.drain();
		expect(order[0]).toBe("chat");
		expect(order[1]).toBe("memory");
		expect(order[2]).toBe("rag");
	});

	it("resolves promise with embedding result", async () => {
		const embedding = new Array(1536).fill(0.42);
		queue.setEmbedFn(async () => embedding);
		queue.startProcessing();

		const result = await new Promise<number[]>((resolve, reject) => {
			queue.enqueue({
				id: "x",
				text: "test",
				priority: "session_chat",
				resolve,
				reject,
			});
			queue.drain();
		});

		expect(result).toEqual(embedding);
	});

	it("rejects promise on embed failure", async () => {
		queue.setEmbedFn(async () => {
			throw new Error("embed failed");
		});
		queue.startProcessing();

		const result = await new Promise<unknown>((resolve) => {
			queue.enqueue({
				id: "y",
				text: "test",
				priority: "session_chat",
				resolve: () => resolve("should not resolve"),
				reject: (err: Error) => resolve(err.message),
			});
			queue.drain();
		});

		expect(result).toBe("embed failed");
	});
});
