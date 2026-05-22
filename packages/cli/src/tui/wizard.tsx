import React from "react";
import { Box, Text } from "ink";

export const WIZARD_STEPS = 2;

export interface SetupWizardProps {
	step: number;
	selectedProvider?: string;
}

const PROVIDERS = ["anthropic", "openai", "google"];

export function SetupWizard({ step, selectedProvider }: SetupWizardProps) {
	if (step >= WIZARD_STEPS) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="green" bold>✓ Setup Done</Text>
				<Text dimColor>Configuration saved. Run `ebsclaw tui` to start.</Text>
			</Box>
		);
	}

	if (step === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text bold color="cyan">Step 1/2: Provider</Text>
				<Box marginTop={1} flexDirection="column">
					{PROVIDERS.map((p, i) => (
						<Text key={p} color={i === 0 ? "green" : "white"}>
							{i === 0 ? "▸ " : "  "}{p}
						</Text>
					))}
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">Step 2/2: API Key</Text>
			<Box marginTop={1}>
				<Text dimColor>{selectedProvider ?? "unknown"} API key: </Text>
				<Text color="yellow">****</Text>
			</Box>
		</Box>
	);
}
