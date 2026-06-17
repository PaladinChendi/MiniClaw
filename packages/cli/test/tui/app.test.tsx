import { describe, expect, it } from "bun:test";
import { testRender as render } from "../helpers/render.tsx";
import { TUIApp } from "../../src/tui/app.tsx";

describe("TUI App Shell", () => {
	it("renders idle state by default", async () => {
		const { lastFrame } = await render(<TUIApp state="idle" />);
		const output = lastFrame();
		expect(output).toContain("miniclaw");
	});

	it("renders thinking state", async () => {
		const { lastFrame } = await render(<TUIApp state="thinking" />);
		const output = lastFrame();
		expect(output).toBeTruthy();
	});

	it("renders error state", async () => {
		const { lastFrame } = await render(<TUIApp state="error" errorMessage="test error" />);
		const output = lastFrame();
		expect(output).toContain("test error");
	});

	it("renders tool_call state", async () => {
		const { lastFrame } = await render(<TUIApp state="tool_call" toolName="bash" />);
		const output = lastFrame();
		expect(output).toContain("bash");
	});

	it("renders compacting state", async () => {
		const { lastFrame } = await render(<TUIApp state="compacting" compactingLevel="level 3 → level 4" />);
		const output = lastFrame();
		expect(output).toContain("COMPACTING");
	});

	it("renders empty state for new session", async () => {
		const { lastFrame } = await render(<TUIApp state="idle" tokenCount={0} />);
		const output = lastFrame();
		expect(output).toContain("新对话已就绪");
	});

	it("renders model and session info", async () => {
		const { lastFrame } = await render(
			<TUIApp state="idle" model="gpt-4o" sessionId="a3f8c2d1" tokenCount={4231} tokenPercent={23} />,
		);
		const output = lastFrame();
		expect(output).toContain("gpt-4o");
		expect(output).toContain("a3f8");
		expect(output).toContain("4,231");
	});
});
