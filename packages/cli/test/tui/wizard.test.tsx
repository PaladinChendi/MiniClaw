import { describe, expect, it } from "bun:test";
import { testRender as render } from "../helpers/render.tsx";
import { SetupWizard } from "../../src/tui/wizard.tsx";

describe("SetupWizard", () => {
	it("renders provider selection at step 0", async () => {
		const { lastFrame } = await render(<SetupWizard />);
		const output = lastFrame();
		expect(output).toContain("Provider");
		expect(output).toContain("anthropic");
		expect(output).toContain("kcode");
	});

	it("renders base URL input at step 1", async () => {
		const { lastFrame } = await render(<SetupWizard step={1} />);
		const output = lastFrame();
		expect(output).toContain("Base URL");
	});

	it("renders API key input at step 2", async () => {
		const { lastFrame } = await render(<SetupWizard step={2} />);
		const output = lastFrame();
		expect(output).toContain("API Key");
	});

	it("renders model input at step 3", async () => {
		const { lastFrame } = await render(<SetupWizard step={3} />);
		const output = lastFrame();
		expect(output).toContain("Model");
	});
});
