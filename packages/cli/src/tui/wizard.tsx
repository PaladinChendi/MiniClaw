import { Box, Text, useApp, useInput } from "ink";
import React, { useState, useEffect } from "react";
import type { ConfigStore, ProviderConfig, ProviderType } from "../config-store.ts";

// ── Color palette ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const BORDER = "#1a3a1a";

// ── Pulse animation ──
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
				// biome-ignore lint/suspicious/noArrayIndexKey: static progress dots
				<Text key={`dot-${i}`} color={i < current ? CYAN : i === current ? GREEN : DIM} bold={i === current}>
					{i <= current ? "●" : "○"}
				</Text>
			))}
		</Box>
	);
}

// ── Provider options ──
const PROVIDERS: { value: ProviderType; label: string; desc: string }[] = [
	{ value: "anthropic", label: "Anthropic", desc: "Claude · api.anthropic.com" },
	{ value: "openai", label: "OpenAI", desc: "GPT · api.openai.com/v1" },
	{ value: "kcode", label: "kcode", desc: "kcode kcode · 自定义端点" },
	{ value: "custom", label: "custom", desc: "自定义 OpenAI 兼容接口" },
];

const MODEL_DEFAULTS: Record<string, string> = {
	anthropic: "claude-sonnet-4-20250514",
	openai: "gpt-4o",
	kcode: "glm-5.1",
	custom: "",
};

const BASE_URL_DEFAULTS: Record<string, string> = {
	kcode: "",
};

// ── Step labels ──
const STEP_LABELS = ["PROVIDER", "BASE URL", "API KEY", "MODEL"];

// ── Main wizard component ──
export interface SetupWizardProps {
	step?: number;
	configStore?: ConfigStore;
	onComplete?: () => void;
}

export function SetupWizard({ step: initialStep = 0, configStore, onComplete }: SetupWizardProps) {
	const { exit } = useApp();
	const [step, setStep] = useState(initialStep);
	const [cursor, setCursor] = useState(0);
	const [provider, setProvider] = useState<ProviderType>("anthropic");
	const [baseUrlInput, setBaseUrlInput] = useState("");
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [modelInput, setModelInput] = useState("");
	const [done, setDone] = useState(false);
	const pulse = usePulse();

	useInput((input, key) => {
		if (done) return;

		if (step === 0) {
			if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
			else if (key.downArrow) setCursor((c) => Math.min(PROVIDERS.length - 1, c + 1));
			else if (key.return) {
				const selected = PROVIDERS[cursor].value;
				setProvider(selected);
				setBaseUrlInput(BASE_URL_DEFAULTS[selected] ?? "");
				setModelInput(MODEL_DEFAULTS[selected]);
				setStep(1);
			}
		} else if (step === 1) {
			if (key.return) setStep(2);
			else if (key.backspace || key.delete) setBaseUrlInput((v) => v.slice(0, -1));
			else if (input && !key.escape) setBaseUrlInput((v) => v + input);
		} else if (step === 2) {
			if (key.return) {
				if (apiKeyInput.trim()) setStep(3);
			} else if (key.backspace || key.delete) setApiKeyInput((v) => v.slice(0, -1));
			else if (input && !key.escape) setApiKeyInput((v) => v + input);
		} else if (step === 3) {
			if (key.return) {
				if (modelInput.trim()) finish();
			} else if (key.backspace || key.delete) setModelInput((v) => v.slice(0, -1));
			else if (input && !key.escape) setModelInput((v) => v + input);
		}
	});

	async function finish() {
		setDone(true);
		if (configStore) {
			const config: ProviderConfig = {
				provider,
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
					<Text color={GREEN} bold>
						◈ 首次启动配置
					</Text>
				</Box>
				<HRule />
				<Box padding={2} flexDirection="column" gap={1}>
					<Text color={GREEN} bold>
						{" "}
						✓ 配置完成
					</Text>
					<Text color={DIM}>
						{" "}
						PROVIDER: <Text color={CYAN}>{provider}</Text>
					</Text>
					{baseUrlInput && (
						<Text color={DIM}>
							{" "}
							ENDPOINT: <Text color={CYAN}>{baseUrlInput}</Text>
						</Text>
					)}
					<Text color={DIM}>
						{" "}
						MODEL: <Text color={CYAN}>{modelInput}</Text>
					</Text>
					<Text> </Text>
					<Text color={DIM}>
						{" "}
						运行{" "}
						<Text color={GREEN} bold>
							ebsclaw tui
						</Text>{" "}
						启动
					</Text>
				</Box>
			</Box>
		);
	}

	// Step 0: Provider selection
	if (step === 0) {
		return (
			<Box flexDirection="column">
				<Box paddingX={2} paddingY={1}>
					<Text color={GREEN} bold>
						◈ 首次启动配置
					</Text>
				</Box>
				<Box paddingX={2} paddingBottom={1}>
					<Text color={CYAN}>Step 1: 选择 {STEP_LABELS[0]}</Text>
				</Box>
				<HRule />
				<Box padding={2}>
					<ProgressDots current={0} total={4} />
				</Box>
				<Box paddingX={2} flexDirection="column" gap={1}>
					<Box justifyContent="space-between">
						<Text color={CYAN}>Provider</Text>
						<Text color={RED}>必选</Text>
					</Box>
					<Box flexDirection="column">
						{PROVIDERS.map((p, i) => (
							<Box key={p.value}>
								<Text color={i === cursor ? GREEN : MID} bold={i === cursor}>
									{i === cursor ? "▸ " : "  "}
									{p.label}
								</Text>
								{i === cursor && <Text color={DIM}> — {p.desc}</Text>}
							</Box>
						))}
					</Box>
				</Box>
				<Box paddingY={2} paddingX={2} justifyContent="flex-end">
					<Text color={GREEN} bold>
						Next →
					</Text>
				</Box>
			</Box>
		);
	}

	// Steps 1-3: Text input
	const fields = [
		{
			label: "Base URL",
			required: false,
			hint: provider === "kcode" ? "kcode kcode 端点 · Enter 确认" : "e.g. https://api.openai.com/v1 · Enter 跳过",
			value: baseUrlInput,
			masked: false,
		},
		{ label: "API Key", required: true, hint: "密钥存储于 ~/.ebsclaw/config.yaml", value: apiKeyInput, masked: true },
		{
			label: "Model",
			required: true,
			hint: provider === "kcode" ? "e.g. glm-5.1" : "e.g. gpt-4o, deepseek-chat, claude-sonnet-4-20250514",
			value: modelInput,
			masked: false,
		},
	];

	const currentField = fields[step - 1];

	return (
		<Box flexDirection="column">
			<Box paddingX={2} paddingY={1}>
				<Text color={GREEN} bold>
					◈ 首次启动配置
				</Text>
			</Box>
			<Box paddingX={2} paddingBottom={1}>
				<Text color={CYAN}>
					Step {step + 1}: 配置 {STEP_LABELS[step]}
				</Text>
			</Box>
			<HRule />
			<Box padding={2}>
				<ProgressDots current={step} total={4} />
			</Box>
			<Box paddingX={2} flexDirection="column" gap={1}>
				<Box justifyContent="space-between">
					<Text color={CYAN}>{currentField.label}</Text>
					{currentField.required ? <Text color={RED}>必选</Text> : <Text color={MID}>可选</Text>}
				</Box>
				<Text color={GREEN} backgroundColor="#111">
					{"  "}
					{currentField.masked ? "•".repeat(currentField.value.length) : currentField.value}
					{pulse ? "█" : " "}
				</Text>
				<Text color={DIM}>{currentField.hint}</Text>
			</Box>
			<Box paddingY={2} paddingX={2} justifyContent="space-between">
				{step > 1 ? <Text color={MID}>← Back</Text> : <Text> </Text>}
				<Text color={GREEN} bold>
					Next →
				</Text>
			</Box>
		</Box>
	);
}
