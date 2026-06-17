import { describe, expect, it, vi } from "bun:test";
import { testRender as render } from "../helpers/render.tsx";
import { TUIApp } from "../../src/tui/app.tsx";

describe("TUI State Machine", () => {
	// TU-01: Renders idle state by default
	it("TU-01: renders idle state with miniclaw and ready message", async () => {
		const { lastFrame } = await render(<TUIApp state="idle" />);
		const output = lastFrame();
		expect(output).toContain("miniclaw");
		expect(output).toContain("新对话已就绪");
	});

	// TU-02: Renders thinking state
	it("TU-02: renders thinking state with processing indicator", async () => {
		const { lastFrame } = await render(<TUIApp state="thinking" />);
		const output = lastFrame();
		expect(output).toContain("处理中");
	});

	// TU-03: Renders tool_call state
	it("TU-03: renders tool_call state with tool name", async () => {
		const { lastFrame } = await render(<TUIApp state="tool_call" toolName="bash" />);
		const output = lastFrame();
		expect(output).toContain("bash");
	});

	// TU-04: Renders compacting state
	it("TU-04: renders compacting state with level info", async () => {
		const { lastFrame } = await render(<TUIApp state="compacting" compactingLevel="L3 → L4" />);
		const output = lastFrame();
		expect(output).toContain("COMPACTING");
	});

	// TU-05: Renders error state
	it("TU-05: renders error state with error message", async () => {
		const { lastFrame } = await render(<TUIApp state="error" errorMessage="API failed" />);
		const output = lastFrame();
		expect(output).toContain("API failed");
	});

	// TU-06: Renders messages correctly
	it("TU-06: renders user and assistant text messages", async () => {
		const { lastFrame } = await render(
			<TUIApp
				state="idle"
				messages={[
					{ type: "user_text", content: "hello" },
					{ type: "assistant_text", content: "hi there" },
				]}
			/>,
		);
		const output = lastFrame();
		expect(output).toContain("hello");
		expect(output).toContain("hi there");
	});

	// TU-07: Exit callback prop is passed through
	it("TU-07: accepts onExit callback prop", async () => {
		const onExit = vi.fn();
		const { lastFrame } = await render(<TUIApp state="idle" onExit={onExit} />);
		const output = lastFrame();
		expect(output).toContain("miniclaw");
		expect(onExit).not.toHaveBeenCalled();
	});

	// TU-08: Idle with messages shows waiting indicator
	it("TU-08: idle state with messages shows waiting indicator", async () => {
		const { lastFrame } = await render(<TUIApp state="idle" messages={[{ type: "user_text", content: "test" }]} />);
		const output = lastFrame();
		expect(output).toContain("等待输入");
	});
});
