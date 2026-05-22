import { describe, it, expect } from "bun:test";
import { TUIApp } from "../../src/tui/app.tsx";
import { render } from "ink-testing-library";

describe("TUI App Shell", () => {
	it("renders idle state by default", () => {
		const { lastFrame } = render(<TUIApp state="idle" />);
		const output = lastFrame();
		expect(output).toContain("ebsclaw");
	});

	it("renders thinking state with spinner", () => {
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

	it("renders review state", () => {
		const { lastFrame } = render(<TUIApp state="review" toolName="edit" />);
		const output = lastFrame();
		expect(output).toContain("edit");
	});
});
