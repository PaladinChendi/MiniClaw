import { Box, Text, useApp, useInput } from "ink";
import React, { useState, useEffect } from "react";
import { ConfigStore, type ProviderConfig } from "../config-store.ts";

// ── Color palette (from mockup-v1) ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const LIGHT = "#aaa";
const BORDER = "#1a3a1a";

// ── Pulse animation for progress dots ──
function usePulse(interval = 600) {
	const [on, setOn] = useState(true);
	useEffect(() => {
		const id = setInterval(() => setOn((v) => !v), interval);
		return () => clearInterval(id);
	}, [interval]);
	return on;
}

// ── Horizontal rule ──
function HRule() {
	return <Text color={BORDER}>{"─".repeat(52)}</Text>;
}

// ── Progress dots ──
function ProgressDots({ current, total }: { current: number; total: number }) {
	return (
		<Box gap={1}>
			{Array.from({ length: total }, (_, i) => (
				<Text
					key={i}
					color={i < current ? CYAN : i === current ? GREEN : DIM}
					bold={i === current}
				>
					{i <= current ? "●" : "○"}
				</Text>
			))}
		</Box>
	);
}

// ── Main wizard component ──
export interface SetupWizardProps {
	step?: number;
	configStore?: ConfigStore;
	onComplete?: () => void;
}

const STEPS = ["BASE URL", "API KEY", "MODEL"];

export function SetupWizard({ step: initialStep = 0, configStore, onComplete }: SetupWizardProps) {
	const { exit } = useApp();
	const [step, setStep] = useState(initialStep);
	const [baseUrlInput, setBaseUrlInput] = useState("");
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [modelInput, setModelInput] = useState("");
	const [done, setDone] = useState(false);
	const pulse = usePulse();

	useInput((input, key) => {
		if (done) return;

		if (step === 0) {
			if (key.return) {
				setStep(1);
			} else if (key.backspace || key.delete) {
				setBaseUrlInput((v) => v.slice(0, -1));
			} else if (input && !key.escape) {
				setBaseUrlInput((v) => v + input);
			}
		} else if (step === 1) {
			if (key.return) {
				if (apiKeyInput.trim()) setStep(2);
			} else if (key.backspace || key.delete) {
				setApiKeyInput((v) => v.slice(0, -1));
			} else if (input && !key.escape) {
				setApiKeyInput((v) => v + input);
			}
		} else if (step === 2) {
			if (key.return) {
				if (modelInput.trim()) finish();
			} else if (key.backspace || key.delete) {
				setModelInput((v) => v.slice(0, -1));
			} else if (input && !key.escape) {
				setModelInput((v) => v + input);
			}
		}
	});

	async function finish() {
		setDone(true);
		if (configStore) {
			const config: ProviderConfig = {
				baseUrl: baseUrlInput,
				apiKey: apiKeyInput,
				model: modelInput,
			};
			await configStore.save(config);
		}
		onComplete?.();
		exit();
	}

	if (done) {
		return (
			<Box flexDirection="column">
				<Box paddingX={2} paddingY={1}>
					<Text color={GREEN} bold>◈ 首次启动配置</Text>
				</Box>
				<HRule />
				<Box padding={2} flexDirection="column" gap={1}>
					<Text color={GREEN} bold>  ✓ 配置完成</Text>
					{baseUrlInput && (
						<Text color={DIM}>  ENDPOINT: <Text color={CYAN}>{baseUrlInput}</Text></Text>
					)}
					<Text color={DIM}>  MODEL: <Text color={CYAN}>{modelInput}</Text></Text>
					<Text> </Text>
					<Text color={DIM}>  运行 <Text color={GREEN} bold>ebsclaw tui</Text> 启动</Text>
				</Box>
			</Box>
		);
	}

	const stepLabels = [
		{ field: "Base URL", required: false, hint: "e.g. https://api.openai.com/v1 · Enter 跳过", value: baseUrlInput, masked: false },
		{ field: "API Key", required: true, hint: "密钥存储于 ~/.ebsclaw/config.yaml", value: apiKeyInput, masked: true },
		{ field: "Model", required: true, hint: "e.g. gpt-4o, deepseek-chat, claude-sonnet-4-20250514", value: modelInput, masked: false },
	];

	const currentField = stepLabels[step];

	return (
		<Box flexDirection="column">
			{/* Title bar */}
			<Box paddingX={2} paddingY={1}>
				<Text color={GREEN} bold>◈ 首次启动配置</Text>
			</Box>

			{/* Step indicator */}
			<Box paddingX={2} paddingBottom={1}>
				<Text color={CYAN}>Step {step + 1}: 配置 {STEPS[step]}</Text>
			</Box>
			<HRule />

			{/* Progress dots */}
			<Box padding={2}>
				<ProgressDots current={step} total={3} />
			</Box>

			{/* Form fields */}
			<Box paddingX={2} flexDirection="column" gap={1}>
				<Box justifyContent="space-between">
					<Text color={CYAN}>{currentField.field}</Text>
					{currentField.required ? (
						<Text color={RED}>必选</Text>
					) : (
						<Text color={MID}>可选</Text>
					)}
				</Box>
				<Text color={GREEN} backgroundColor="#111">
					{"  "}{currentField.masked ? "•".repeat(currentField.value.length) : currentField.value}{pulse ? "█" : " "}
				</Text>
				<Text color={DIM}>{currentField.hint}</Text>
			</Box>

			{/* Action bar */}
			<Box paddingY={2} paddingX={2} justifyContent="space-between">
				{step > 0 ? (
					<Text color={MID}>← Back</Text>
				) : (
					<Text> </Text>
				)}
				<Text color={GREEN} bold>Next →</Text>
			</Box>
		</Box>
	);
}
