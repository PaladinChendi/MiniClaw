import { Box, Text, useApp } from "ink";
import React, { useEffect, useState } from "react";

// ── Color palette ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const BORDER = "#1a3a1a";

// ── ASCII logo ──
const LOGO = [
	" ███████╗██╗     ██╗██████╗",
	" ██╔════╝██║     ██║██╔══██╗",
	" █████╗  ██║     ██║██████╔╝",
	" ██╔══╝  ██║     ██║██╔══██╗",
	" ██║     ███████╗██║██████╔╝",
	" ╚═╝     ╚══════╝╚═╝╚═════╝",
];

// ── Loading bar animation ──
const BAR_COUNT = 5;

function useLoadingBar(interval = 200) {
	const [active, setActive] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setActive((a) => (a + 1) % (BAR_COUNT + 3)), interval);
		return () => clearInterval(id);
	}, [interval]);
	return active;
}

// ── Blink animation ──
function useBlink(interval = 1000) {
	const [on, setOn] = useState(true);
	useEffect(() => {
		const id = setInterval(() => setOn((v) => !v), interval);
		return () => clearInterval(id);
	}, [interval]);
	return on;
}

// ── Startup info items ──
interface StartupItem {
	label: string;
	detail: string;
}

export interface StartupSplashProps {
	provider: string;
	model: string;
	items?: StartupItem[];
	onDone?: () => void;
	autoDismissMs?: number;
}

export function StartupSplash({ provider, model, items, onDone, autoDismissMs = 3000 }: StartupSplashProps) {
	const { exit } = useApp();
	const blink = useBlink();
	const barStep = useLoadingBar(200);
	const [phase, setPhase] = useState<"loading" | "ready">("loading");

	const defaultItems: StartupItem[] = items ?? [
		{ label: "Plugin Registry", detail: "3 loaded" },
		{ label: "LLM Router", detail: `${provider}/${model} → primary` },
		{ label: "Memory Core", detail: "indexed" },
		{ label: "Session Manager", detail: "0 active / 0 saved" },
	];

	useEffect(() => {
		const readyTimer = setTimeout(() => setPhase("ready"), autoDismissMs * 0.6);
		const doneTimer = setTimeout(() => {
			onDone?.();
		}, autoDismissMs);
		return () => {
			clearTimeout(readyTimer);
			clearTimeout(doneTimer);
		};
	}, [autoDismissMs, onDone]);

	const statusText = phase === "ready"
		? "● Gateway Daemon ready."
		: "● Initializing Gateway Daemon...";

	return (
		<Box flexDirection="column" padding={1}>
			{/* ASCII logo */}
			<Box flexDirection="column" paddingLeft={1}>
				{LOGO.map((line, i) => (
					<Text key={i} color={GREEN} bold>{line}</Text>
				))}
			</Box>

			{/* Subtitle & version */}
			<Box flexDirection="column" paddingLeft={2} marginTop={1}>
				<Text color={CYAN}>AI Agent Platform · Plugin-First</Text>
				<Text color={DIM}>v1.0.0-alpha · Bun {typeof Bun !== "undefined" ? Bun.version : "1.3"} · TypeScript</Text>
			</Box>

			{/* Status line */}
			<Box paddingLeft={2} marginTop={1}>
				<Text color={GREEN}>{statusText}{blink ? "█" : " "}</Text>
			</Box>

			{/* Loading bar */}
			<Box paddingLeft={2} marginTop={1} gap={1}>
				{Array.from({ length: BAR_COUNT }, (_, i) => (
					<Text
						key={i}
						color={GREEN}
						dimColor={barStep <= i}
						bold={barStep === i}
					>
						▎
					</Text>
				))}
			</Box>

			{/* Info items */}
			<Box flexDirection="column" paddingLeft={2} marginTop={1}>
				{defaultItems.map((item, i) => (
					<Text key={i} color={phase === "ready" ? DIM : MID}>
						{item.label.padEnd(18)}<Text color={GREEN}> ✓</Text> {item.detail}
					</Text>
				))}
			</Box>

			{/* Corner decoration */}
			<Box marginTop={1} justifyContent="flex-end" paddingRight={2}>
				<Text color={GREEN} dimColor>█▀▄</Text>
			</Box>
		</Box>
	);
}
