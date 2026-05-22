import React from "react";
import { Box, Text } from "ink";

export type TUIState = "idle" | "thinking" | "tool_call" | "review" | "error";

export interface TUIAppProps {
	state: TUIState;
	toolName?: string;
	errorMessage?: string;
}

const STATE_COLORS: Record<TUIState, string> = {
	idle: "cyan",
	thinking: "yellow",
	tool_call: "magenta",
	review: "green",
	error: "red",
};

const STATE_LABELS: Record<TUIState, string> = {
	idle: "READY",
	thinking: "THINKING",
	tool_call: "TOOL",
	review: "REVIEW",
	error: "ERROR",
};

export function TUIApp({ state, toolName, errorMessage }: TUIAppProps) {
	const color = STATE_COLORS[state];
	const label = STATE_LABELS[state];

	return (
		<Box flexDirection="column" padding={1}>
			<Box>
				<Text bold color="cyan">{"ebsclaw"}</Text>
				<Text> </Text>
				<Text color={color} bold>[{label}]</Text>
			</Box>
			{state === "tool_call" && toolName && (
				<Box marginLeft={2}>
					<Text color="magenta">▸ {toolName}</Text>
				</Box>
			)}
			{state === "review" && toolName && (
				<Box marginLeft={2}>
					<Text color="green">⚡ {toolName} (awaiting approval)</Text>
				</Box>
			)}
			{state === "thinking" && (
				<Box marginLeft={2}>
					<Text color="yellow">◌ processing...</Text>
				</Box>
			)}
			{state === "error" && errorMessage && (
				<Box marginLeft={2}>
					<Text color="red">✗ {errorMessage}</Text>
				</Box>
			)}
		</Box>
	);
}
