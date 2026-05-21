import { describe, it, expect } from "bun:test";
import { EbsclawError, UserActionError, RetryableError, CorruptDataError, FatalError } from "../../src/index.ts";

describe("Error taxonomy subclasses", () => {
	it("UserActionError has correct fields", () => {
		const err = new UserActionError("bad key", "re-enter API key");
		expect(err.category).toBe("user-action");
		expect(err.recoverable).toBe(false);
		expect(err.userAction).toBe("re-enter API key");
		expect(err.name).toBe("UserActionError");
		expect(err instanceof EbsclawError).toBe(true);
	});

	it("RetryableError has maxRetries", () => {
		const err = new RetryableError("timeout", 5);
		expect(err.category).toBe("retryable");
		expect(err.recoverable).toBe(true);
		expect(err.maxRetries).toBe(5);
		expect(err.name).toBe("RetryableError");
	});

	it("RetryableError defaults to 3 retries", () => {
		const err = new RetryableError("fail");
		expect(err.maxRetries).toBe(3);
	});

	it("CorruptDataError has backupAvailable", () => {
		const err = new CorruptDataError("bad session", true);
		expect(err.category).toBe("corrupt");
		expect(err.recoverable).toBe(true);
		expect(err.backupAvailable).toBe(true);
		expect(err.name).toBe("CorruptDataError");
	});

	it("FatalError is not recoverable", () => {
		const err = new FatalError("OOM");
		expect(err.category).toBe("fatal");
		expect(err.recoverable).toBe(false);
		expect(err.name).toBe("FatalError");
	});
});
