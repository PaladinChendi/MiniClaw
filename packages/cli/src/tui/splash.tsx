import { Box, Text } from "ink";
import React, { useEffect, useRef, useState } from "react";

// ── Color palette ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const DIM = "#444";
const MID = "#666";
const BORDER = "#1a3a1a";

// ── Pixel creature (cute chunky mascot) ──
const LOGO = [
	" ██        ██ ",
	"██████████████",
	"██    ██    ██",
	"██    ██    ██",
	"██████████████",
	"██████████████",
	"  ████  ████  ",
];

// ── Init step ──
interface InitStep {
	label: string;
	task: () => Promise<void>;
}

interface SplashProps {
	provider: string;
	model: string;
	initSteps: InitStep[];
	onDone: () => void;
	collapsed?: boolean;
}

export function StartupSplash({ provider, model, initSteps, onDone, collapsed }: SplashProps) {
	const [stepStates, setStepStates] = useState<Array<"pending" | "running" | "done">>(
		() => initSteps.map(() => "pending"),
	);
	const [summaryLine, setSummaryLine] = useState("");
	const startTime = useRef(Date.now());
	const [finished, setFinished] = useState(false);
	const minDisplayMs = 1200;

	useEffect(() => {
		let cancelled = false;

		async function runSteps() {
			for (let i = 0; i < initSteps.length; i++) {
				if (cancelled) return;
				setStepStates((prev) => {
					const next = [...prev];
					next[i] = "running";
					return next;
				});
				try {
					await initSteps[i].task();
				} catch {
					// swallow — step still transitions to done
				}
				if (cancelled) return;
				setStepStates((prev) => {
					const next = [...prev];
					next[i] = "done";
					return next;
				});
			}

			const elapsed = Date.now() - startTime.current;
			const remaining = Math.max(0, minDisplayMs - elapsed);
			if (remaining > 0) {
				await new Promise((r) => setTimeout(r, remaining));
			}
			if (cancelled) return;
			setSummaryLine(`${provider}/${model} -> primary`);
			setFinished(true);
			onDone();
		}

		runSteps();
		return () => {
			cancelled = true;
		};
	}, []);

	// Collapsed mode: compact summary only
	if (collapsed) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text color={GREEN} bold>
						miniclaw
					</Text>
					<Text color={DIM}> v1.0.0-alpha · </Text>
					<Text color={CYAN}>{provider}/{model}</Text>
					<Text color={DIM}> · {initSteps.length} modules loaded</Text>
				</Box>
				<Text color={BORDER}>──────────────────────────────</Text>
			</Box>
		);
	}

	// Full splash
	return (
		<Box flexDirection="column" alignItems="center" paddingY={1}>
			<Box flexDirection="column" alignItems="center">
				{LOGO.map((line, i) => (
					<Text key={i} color={GREEN}>
						{line}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text color={GREEN} bold>
					miniclaw
				</Text>
				<Text color={DIM}> v1.0.0-alpha </Text>
				<Text color={DIM}>
					. Bun {Bun.version} . TypeScript
				</Text>
			</Box>
			<Box>
				<Text color={MID}>AI Agent Platform . Plugin-First</Text>
			</Box>

			<Box flexDirection="column" marginTop={1} width={40}>
				{initSteps.map((step, i) => {
					const state = stepStates[i];
					return (
						<Text key={i}>
							{state === "done" ? (
								<Text color={GREEN}> ✓</Text>
							) : state === "running" ? (
								<Text color={CYAN}> ◌</Text>
							) : (
								<Text color={DIM}> ○</Text>
							)}
							<Text> {step.label}</Text>
							{i === 2 ? ` ${summaryLine}` : ""}
						</Text>
					);
				})}
			</Box>

			<Box marginTop={1}>
				<Text color={GREEN} dimColor>
					█▀▄
				</Text>
			</Box>
		</Box>
	);
}
