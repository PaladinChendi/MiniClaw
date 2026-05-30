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
export interface InitStep {
	label: string;
	task: () => Promise<void>;
}

export interface StartupSplashProps {
	provider: string;
	model: string;
	initSteps: InitStep[];
	onDone?: () => void;
	minDisplayMs?: number;
}

export function StartupSplash({
	provider,
	model,
	initSteps,
	onDone,
	minDisplayMs = 1200,
}: StartupSplashProps) {
	const mountTime = useRef(Date.now());
	const [completed, setCompleted] = useState<Set<number>>(new Set());
	const [running, setRunning] = useState(0);
	const doneRef = useRef(false);

	const summaryLine = `${provider}/${model} → primary`;

	// Execute init steps sequentially
	useEffect(() => {
		let cancelled = false;

		(async () => {
			for (let i = 0; i < initSteps.length; i++) {
				if (cancelled) return;
				setRunning(i);
				try {
					await initSteps[i].task();
				} catch {
					// Step error — continue to next step
				}
				if (cancelled) return;
				setCompleted((prev) => new Set(prev).add(i));
			}

			// All steps done — respect minDisplayMs
			if (cancelled) return;
			const elapsed = Date.now() - mountTime.current;
			const remaining = Math.max(0, minDisplayMs - elapsed);

			const fireDone = () => {
				if (doneRef.current) return;
				doneRef.current = true;
				onDone?.();
			};

			if (remaining > 0) {
				setTimeout(fireDone, remaining);
			} else {
				fireDone();
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [initSteps, minDisplayMs, onDone]);

	return (
		<Box flexDirection="column" padding={1}>
			{LOGO.map((line, i) => (
				<Text key={i} color={GREEN} bold>
					{line}
				</Text>
			))}

			<Box flexDirection="column" marginTop={1}>
				<Text color={CYAN}>AI Agent Platform · Plugin-First</Text>
				<Text color={DIM}>v1.0.0-alpha · Bun {typeof Bun !== "undefined" ? Bun.version : "1.3"} · TypeScript</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				{initSteps.map((step, i) => {
					const isDone = completed.has(i);
					const isNow = running === i && !isDone;
					return (
						<Text key={step.label} color={MID}>
							{step.label.padEnd(18)}
							{isDone ? (
								<Text color={GREEN}> ✓</Text>
							) : isNow ? (
								<Text color={CYAN}> ◌</Text>
							) : (
								<Text color={DIM}> ○</Text>
							)}
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
