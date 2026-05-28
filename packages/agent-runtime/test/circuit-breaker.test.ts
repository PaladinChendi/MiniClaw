import { beforeEach, describe, expect, it } from "bun:test";
import { CircuitBreaker } from "../src/circuit-breaker.ts";

describe("CircuitBreaker", () => {
	let cb: CircuitBreaker;

	beforeEach(() => {
		cb = new CircuitBreaker({ halfOpenAfterMs: 600, successThreshold: 2, failureThreshold: 3 });
	});

	it("starts in closed state", () => {
		expect(cb.state).toBe("closed");
	});

	it("transitions to open after failureThreshold failures", () => {
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("closed");
		cb.recordFailure();
		expect(cb.state).toBe("open");
	});

	it("rejects calls immediately in open state", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("open");
		expect(cb.allowRequest()).toBe(false);
	});

	it("transitions to half-open after halfOpenAfterMs", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("open");

		// Manually advance internal clock by tweaking lastFailureTime
		const now = Date.now();
		(cb as any).lastFailureTime = now - 700;
		expect(cb.state).toBe("half-open");
		expect(cb.allowRequest()).toBe(true);
	});

	it("recovers to closed after successThreshold successes in half-open", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();

		(cb as any).lastFailureTime = Date.now() - 700;
		expect(cb.state).toBe("half-open");
		cb.recordSuccess();
		expect(cb.state).toBe("half-open");
		cb.recordSuccess();
		expect(cb.state).toBe("closed");
	});

	it("returns to open on failure in half-open", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();

		(cb as any).lastFailureTime = Date.now() - 700;
		cb.recordFailure();
		expect(cb.state).toBe("open");
	});

	it("resets failure count on success in closed state", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordSuccess();
		cb.recordFailure();
		cb.recordFailure();
		expect(cb.state).toBe("closed");
	});

	it("reset() returns to closed", () => {
		cb.recordFailure();
		cb.recordFailure();
		cb.recordFailure();
		cb.reset();
		expect(cb.state).toBe("closed");
		expect(cb.allowRequest()).toBe(true);
	});
});
