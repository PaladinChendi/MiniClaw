import { describe, expect, it } from "bun:test";
import { hashVector, keywordScore } from "../src/index.ts";

describe("hashVector", () => {
	it("returns vector of correct dimensions", () => {
		const vec = hashVector("hello world", 64);
		expect(vec.length).toBe(64);
	});

	it("produces normalized vectors (unit length)", () => {
		const vec = hashVector("test input");
		const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
		expect(norm).toBeCloseTo(1, 5);
	});

	it("is deterministic for same input", () => {
		const a = hashVector("same text");
		const b = hashVector("same text");
		expect(a).toEqual(b);
	});

	it("produces different vectors for different inputs", () => {
		const a = hashVector("alpha");
		const b = hashVector("beta");
		const same = a.every((v, i) => v === b[i]);
		expect(same).toBe(false);
	});
});

describe("keywordScore", () => {
	it("returns 1 for identical text", () => {
		expect(keywordScore("hello world", "hello world")).toBe(1);
	});

	it("returns 0.5 for half-matching tokens", () => {
		expect(keywordScore("hello world", "hello there")).toBe(0.5);
	});

	it("returns 0 for no matching tokens", () => {
		expect(keywordScore("alpha", "beta")).toBe(0);
	});

	it("returns 0 for empty query", () => {
		expect(keywordScore("", "some text")).toBe(0);
	});
});
