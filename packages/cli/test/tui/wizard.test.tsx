import { describe, it, expect } from "bun:test";
import { SetupWizard, WIZARD_STEPS } from "../../src/tui/wizard.tsx";
import { render } from "ink-testing-library";

describe("SetupWizard", () => {
	it("renders step 1: provider selection", () => {
		const { lastFrame } = render(<SetupWizard step={0} />);
		const output = lastFrame();
		expect(output).toContain("Provider");
	});

	it("renders step 2: API key input", () => {
		const { lastFrame } = render(<SetupWizard step={1} selectedProvider="anthropic" />);
		const output = lastFrame();
		expect(output).toContain("API");
		expect(output).toContain("anthropic");
	});

	it("renders completion state", () => {
		const { lastFrame } = render(<SetupWizard step={2} />);
		const output = lastFrame();
		expect(output).toContain("Done");
	});

	it("exports correct number of steps", () => {
		expect(WIZARD_STEPS).toBe(2);
	});
});
