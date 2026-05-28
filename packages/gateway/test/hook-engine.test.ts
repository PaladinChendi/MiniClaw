import { describe, expect, it } from "bun:test";
import { HookEngine } from "../src/hook-engine.ts";

describe("HookEngine", () => {
	it("registers and fires a hook", async () => {
		const engine = new HookEngine();
		const received: unknown[] = [];
		engine.register("pre_ingress", "h1", async (msg) => {
			received.push(msg);
		});
		await engine.fire("pre_ingress", { text: "hello" });
		expect(received).toEqual([{ text: "hello" }]);
	});

	it("fires hooks in priority order", async () => {
		const engine = new HookEngine();
		const order: string[] = [];
		engine.register(
			"pre_egress",
			"low",
			async () => {
				order.push("low");
			},
			{ priority: 10 },
		);
		engine.register(
			"pre_egress",
			"high",
			async () => {
				order.push("high");
			},
			{ priority: 1 },
		);
		await engine.fire("pre_egress", {});
		expect(order).toEqual(["high", "low"]);
	});

	it("isolates hook failure — other hooks still run", async () => {
		const engine = new HookEngine();
		const results: string[] = [];
		engine.register("pre_ingress", "good1", async () => {
			results.push("good1");
		});
		engine.register("pre_ingress", "bad", async () => {
			throw new Error("boom");
		});
		engine.register("pre_ingress", "good2", async () => {
			results.push("good2");
		});
		await engine.fire("pre_ingress", {});
		expect(results).toEqual(["good1", "good2"]);
	});

	it("unregisters a hook", async () => {
		const engine = new HookEngine();
		let called = false;
		engine.register("pre_ingress", "h1", async () => {
			called = true;
		});
		engine.unregister("pre_ingress", "h1");
		await engine.fire("pre_ingress", {});
		expect(called).toBe(false);
	});

	it("fires multiple hooks on same event", async () => {
		const engine = new HookEngine();
		const results: number[] = [];
		engine.register("pre_ingress", "a", async () => {
			results.push(1);
		});
		engine.register("pre_ingress", "b", async () => {
			results.push(2);
		});
		await engine.fire("pre_ingress", {});
		expect(results).toEqual([1, 2]);
	});
});
