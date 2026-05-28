import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { TUIApp } from "../../src/tui/app.tsx";

describe("TUI App Shell", () => {
	it("renders idle state by default", () => {
		const { lastFrame } = render(<TUIApp state="idle" />);
		const output = lastFrame();
		expect(output).toContain("ebsclaw");
	});

	it("renders thinking state", () => {
		const { lastFrame } = render(<TUIApp state="thinking" />);
		const output = lastFrame();
		expect(output).toBeTruthy();
	});

	it("renders error state", () => {
		const { lastFrame } = render(<TUIApp state="error" errorMessage="test error" />);
		const output = lastFrame();
		expect(output).toContain("test error");
	});

	it("renders tool_call state", () => {
		const { lastFrame } = render(<TUIApp state="tool_call" toolName="bash" />);
		const output = lastFrame();
		expect(output).toContain("bash");
	});

	it("renders compacting state", () => {
		const { lastFrame } = render(<TUIApp state="compacting" compactingLevel="level 3 → level 4" />);
		const output = lastFrame();
		expect(output).toContain("COMPACTING");
	});

	it("renders empty state for new session", () => {
		const { lastFrame } = render(<TUIApp state="idle" tokenCount={0} />);
		const output = lastFrame();
		expect(output).toContain("新对话已就绪");
	});

	it("renders model and session info", () => {
		const { lastFrame } = render(
			<TUIApp state="idle" model="gpt-4o" sessionId="a3f8c2d1" tokenCount={4231} tokenPercent={23} />,
		);
		const output = lastFrame();
		expect(output).toContain("gpt-4o");
		expect(output).toContain("a3f8");
		expect(output).toContain("4,231");
	});
});
