import { Box, Text, useApp, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { MessageRenderer } from "./MessageRenderer.tsx";
import type { RichMessage } from "./messages.ts";

// ── Color palette ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const LIGHT = "#aaa";
const BORDER = "#1a3a1a";

// ── Braille spinner ──
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function usePulse(interval = 80) {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length), interval);
		return () => clearInterval(id);
	}, [interval]);
	return BRAILLE_FRAMES[frame];
}

// ── Horizontal rule ──
function HRule() {
	return <Text color={BORDER}>{"─".repeat(58)}</Text>;
}

// ── Types ──
export type TUIState = "idle" | "thinking" | "tool_call" | "compacting" | "error";

export interface TUIAppProps {
	state: TUIState;
	provider?: string;
	model?: string;
	sessionId?: string;
	tokenCount?: number;
	tokenPercent?: number;
	pluginCount?: number;
	memoryCount?: number;
	uptime?: string;
	toolName?: string;
	compactingLevel?: string;
	errorMessage?: string;
	fallbackActive?: boolean;
	messages?: RichMessage[];
	onSubmit?: (text: string) => void;
	onExit?: () => void;
	onAbort?: () => void;
}

export function TUIApp({
	state,
	model = "unknown",
	sessionId = "new",
	tokenCount = 0,
	tokenPercent = 0,
	pluginCount = 0,
	memoryCount = 0,
	uptime = "0m",
	toolName,
	compactingLevel,
	errorMessage,
	fallbackActive = false,
	messages = [],
	onSubmit,
	onExit,
	onAbort,
}: TUIAppProps) {
	const { exit } = useApp();
	const [input, setInput] = useState("");
	const pulse = usePulse(80);
	const shortSession = sessionId.slice(0, 4);

	useInput((ch, key) => {
		if (state === "thinking" || state === "compacting" || state === "tool_call") {
			if (key.escape) {
				onAbort?.();
				return;
			}
			return;
		}

		if (key.escape) {
			onExit?.();
			exit();
			return;
		}
		if (key.return) {
			const text = input.trim();
			if (text) {
				onSubmit?.(text);
				setInput("");
			}
			return;
		}
		if (key.backspace || key.delete) {
			setInput((v) => v.slice(0, -1));
			return;
		}
		if (ch && !key.ctrl && !key.meta) {
			setInput((v) => v + ch);
		}
	});

	return (
		<Box flexDirection="column">
			{/* ── Header ── */}
			<Box justifyContent="space-between" paddingX={1}>
				<Text color={GREEN} bold>
					◆ miniclaw
				</Text>
				{state === "error" ? (
					<Text color={RED}>
						session: {shortSession} · ERROR · {tokenCount.toLocaleString()} tokens
					</Text>
				) : (
					<Text color={MID}>
						session: {shortSession} · {tokenCount.toLocaleString()} tokens · {tokenPercent}%
					</Text>
				)}
				<Text color={CYAN}>{model}</Text>
			</Box>
			<HRule />

			{/* ── Error banner ── */}
			{state === "error" && errorMessage && (
				<Box paddingX={1}>
					<Text color={RED}>⚠ {errorMessage}</Text>
				</Box>
			)}

			{/* ── Compacting indicator ── */}
			{state === "compacting" && (
				<Box paddingX={1} gap={1}>
					<Text color={CYAN}>{pulse}</Text>
					<Text color={CYAN}>COMPACTING... {compactingLevel ?? ""}</Text>
				</Box>
			)}

			{/* ── Body: messages ── */}
			<Box flexDirection="column" paddingX={1}>
				{messages.length === 0 && state === "idle" ? (
					<Box flexDirection="column" alignItems="center" paddingY={2}>
						<Text color={GREEN} dimColor>
							◆
						</Text>
						<Text color={MID}>新对话已就绪</Text>
						<Text color={DIM}>输入自然语言开始，或使用 /command</Text>
						<Text color={CYAN}>/help 查看所有命令</Text>
					</Box>
				) : (
					messages.map((msg, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only message list
						<Box key={`rich-msg-${i}`}>
							<MessageRenderer message={msg} />
						</Box>
					))
				)}

				{/* ── Status line inside body ── */}
				{state === "thinking" && (
					<Box>
						<Text color={ORANGE}>{pulse} </Text>
						<Text color={MID}>处理中...</Text>
					</Box>
				)}
				{state === "tool_call" && toolName && (
					<Box>
						<Text color={ORANGE}>• ⚡ {toolName}</Text>
					</Box>
				)}
				{state === "idle" && messages.length > 0 && (
					<Box>
						<Text color={GREEN}>◉ </Text>
						<Text color={DIM}>等待输入</Text>
					</Box>
				)}
			</Box>

			{/* ── Input bar ── */}
			<HRule />
			<Box paddingX={1} justifyContent="space-between">
				<Box>
					<Text color={GREEN}>▸ </Text>
					<Text color={GREEN}>{input}</Text>
					<Text color={GREEN}>█</Text>
				</Box>
				{state === "compacting" ? (
					<Text color={CYAN}>压缩进行中，输入将排队</Text>
				) : state === "error" ? (
					<Text color={DIM}>Enter 发送 · Esc 退出 · /compact 强制压缩</Text>
				) : (
					<Text color={DIM}>Enter 发送 · Esc 退出 · /help 命令</Text>
				)}
			</Box>

			{/* ── Footer ── */}
			<Box justifyContent="space-between" paddingX={1}>
				{fallbackActive ? (
					<Text color={ORANGE}>⚠ fallback active</Text>
				) : (
					<Text color={DIM}>◆ miniclaw v1.0.0-alpha</Text>
				)}
				<Text color={DIM}>
					{pluginCount} plugins · {memoryCount.toLocaleString()} memories · uptime {uptime}
				</Text>
			</Box>
		</Box>
	);
}
