import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { SetupWizard } from "../../src/tui/wizard.tsx";

describe("SetupWizard", () => {
	it("renders provider selection at step 0", () => {
		const { lastFrame } = render(<SetupWizard />);
		const output = lastFrame();
		expect(output).toContain("Provider");
		expect(output).toContain("anthropic");
		expect(output).toContain("kcode");
	});

	it("renders base URL input at step 1", () => {
		const { lastFrame } = render(<SetupWizard step={1} />);
		const output = lastFrame();
		expect(output).toContain("Base URL");
	});

	it("renders API key input at step 2", () => {
		const { lastFrame } = render(<SetupWizard step={2} />);
		const output = lastFrame();
		expect(output).toContain("API Key");
	});

	it("renders model input at step 3", () => {
		const { lastFrame } = render(<SetupWizard step={3} />);
		const output = lastFrame();
		expect(output).toContain("Model");
	});
});
