import { describe, it, expect } from "bun:test";
import { ContextCollapse } from "../../src/compaction/context-collapse.ts";
import type { AgentMessage } from "../../src/types.ts";
import { DEFAULT_COMPACTION_CONFIG } from "../../src/compaction/types.ts";

describe("L5: ContextCollapse", () => {
	it("collapses conversation into stages with project view", () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "fix the auth bug in the middleware and also update the session handler to use JWT tokens instead of cookies and make sure the token rotation works correctly", timestamp: Date.now() - 5000 },
			{ role: "assistant", content: "I will fix the auth bug by updating the middleware to validate JWT tokens and change the session handler to use JWT-based sessions with proper expiration and refresh token rotation as per security best practices for authentication systems", timestamp: Date.now() - 4000 },
			{ role: "tool", content: "file updated successfully — the middleware now validates JWT tokens, session handler uses JWT with 24h expiration and refresh tokens rotated every 7 days as per security best practices for production authentication systems and the changes have been tested with the integration test suite covering all edge cases", toolCallId: "tc1", timestamp: Date.now() - 3000 },
			{ role: "assistant", content: "The fix is applied and tested. The middleware now validates JWT tokens properly, and the session handler uses JWT-based sessions with expiration and refresh token rotation for security as described in the detailed implementation plan for this authentication overhaul project", timestamp: Date.now() - 2000 },
			{ role: "user", content: "add logging to track authentication events and also add rate limiting middleware to prevent brute force attacks on the login endpoint and implement account lockout after failed attempts", timestamp: Date.now() - 1000 },
		];

		const l5 = new ContextCollapse(DEFAULT_COMPACTION_CONFIG, {
			projectView: () => "Project: ebsclaw\nFiles: 42 TypeScript files",
		});

		const result = l5.compact(messages);

		expect(result.applied).toBe(true);
		expect(result.level).toBe(5);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].role).toBe("system");
		expect(result.messages[0].content).toContain("Context Collapse");
		expect(result.messages[0].content).toContain("ebsclaw");
	});

	it("includes summary field", () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "hello", timestamp: Date.now() },
		];

		const l5 = new ContextCollapse(DEFAULT_COMPACTION_CONFIG, {
			projectView: () => "empty project",
		});

		const result = l5.compact(messages);
		expect(result.summary).toBeDefined();
		expect(typeof result.summary).toBe("string");
	});
});
