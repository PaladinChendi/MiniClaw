import type { ToolCall, ToolResult } from "@ebsclaw/agent-runtime";
import { Box, Text } from "ink";
import React, { useState } from "react";
import { Markdown } from "./Markdown.tsx";
import type { RichMessage, ToolUseStatus } from "./messages.ts";

// ── Color palette ──
const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const LIGHT = "#aaa";
const BORDER = "#1a3a1a";

// ── Pulse animation ──
const PULSE_FRAMES = ["◐", "◓", "◑", "◒"];

function usePulse(interval = 300) {
	const [frame, setFrame] = useState(0);
	React.useEffect(() => {
		const id = setInterval(() => setFrame((f) => (f + 1) % PULSE_FRAMES.length), interval);
		return () => clearInterval(id);
	}, [interval]);
	return PULSE_FRAMES[frame];
}

// ── User message renderers ──

function UserText({ content }: { content: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={CYAN}>▸ </Text>
			<Text color={LIGHT}>{content}</Text>
		</Box>
	);
}

function UserImage({ alt }: { alt: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={CYAN}>▸ </Text>
			<Text color={MID}>[image] {alt}</Text>
		</Box>
	);
}

function UserCommand({ command, args }: { command: string; args?: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={CYAN}>▸ </Text>
			<Text color={GREEN}>/{command}</Text>
			{args && <Text color={MID}> {args}</Text>}
		</Box>
	);
}

function UserBash({ command, output, exitCode }: { command: string; output: string; exitCode: number }) {
	const truncated = output.length > 500 ? `${output.slice(0, 500)}…` : output;
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={CYAN}>▸ $ </Text>
				<Text color={LIGHT}>{command}</Text>
			</Box>
			{truncated && (
				<Box marginLeft={3}>
					<Text color={exitCode === 0 ? DIM : RED}>{truncated}</Text>
				</Box>
			)}
		</Box>
	);
}

function UserToolSuccess({ toolName, content }: { toolName: string; content: string }) {
	const truncated = content.length > 200 ? `${content.slice(0, 200)}…` : content;
	return (
		<Box marginBottom={1}>
			<Text color={GREEN}>● </Text>
			<Text color={CYAN}>{toolName}</Text>
			<Text color={DIM}> → </Text>
			<Text color={MID}>{truncated}</Text>
		</Box>
	);
}

function UserToolError({ toolName, content, errorType }: { toolName: string; content: string; errorType?: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={RED}>✗ </Text>
			<Text color={ORANGE}>{toolName}</Text>
			{errorType && <Text color={DIM}> [{errorType}]</Text>}
			<Text color={DIM}> → </Text>
			<Text color={RED}>{content}</Text>
		</Box>
	);
}

function UserToolReject({ toolName, reason }: { toolName: string; reason?: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={ORANGE}>⊘ </Text>
			<Text color={ORANGE}>{toolName}</Text>
			<Text color={DIM}> rejected</Text>
			{reason && <Text color={DIM}> — {reason}</Text>}
		</Box>
	);
}

function Attachment({ fileName, fileType, size }: { fileName: string; fileType: "image" | "file"; size?: number }) {
	const icon = fileType === "image" ? "🖼" : "📎";
	return (
		<Box marginBottom={1}>
			<Text>{icon} </Text>
			<Text color={CYAN}>{fileName}</Text>
			{size !== undefined && <Text color={DIM}> ({size} bytes)</Text>}
		</Box>
	);
}

function UserTeammate({ agentName, content }: { agentName: string; content: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={ORANGE}>◆ </Text>
			<Text color={ORANGE}>{agentName}</Text>
			<Text color={DIM}>: </Text>
			<Text color={MID}>{content}</Text>
		</Box>
	);
}

function UserPlan({ content }: { content: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={CYAN}>◎ Plan: </Text>
			<Text color={LIGHT}>{content}</Text>
		</Box>
	);
}

function UserMemoryInput({ content }: { content: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={GREEN}>✦ Memory: </Text>
			<Text color={LIGHT}>{content}</Text>
		</Box>
	);
}

// ── Assistant message renderers ──

function AssistantText({ content }: { content: string }) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={GREEN}>● </Text>
			</Box>
			<Box marginLeft={2}>
				<Markdown>{content}</Markdown>
			</Box>
		</Box>
	);
}

function AssistantThinking({ content, expanded: initialExpanded }: { content: string; expanded?: boolean }) {
	const [expanded, setExpanded] = useState(initialExpanded ?? false);
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={DIM} bold>
					{expanded ? "▾" : "▸"} Thinking
				</Text>
				<Text color={DIM}> (press t to toggle)</Text>
			</Box>
			{expanded && (
				<Box marginLeft={2} flexDirection="column">
					<Text color={DIM}>{content}</Text>
				</Box>
			)}
		</Box>
	);
}

function AssistantRedactedThinking() {
	return null;
}

function ToolStatusIcon({ status }: { status: ToolUseStatus }) {
	if (status === "running") {
		const pulse = usePulse(150);
		return <Text color={ORANGE}>{pulse}</Text>;
	}
	if (status === "error") return <Text color={RED}>✗</Text>;
	return <Text color={GREEN}>●</Text>;
}

function AssistantToolUse({
	toolCall,
	status,
	result,
	label,
}: {
	toolCall: ToolCall;
	status: ToolUseStatus;
	result?: ToolResult;
	label?: string;
}) {
	let argsPreview = "";
	try {
		const parsed = JSON.parse(toolCall.arguments);
		const entries = Object.entries(parsed);
		argsPreview = entries
			.slice(0, 2)
			.map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
			.join(", ");
		if (entries.length > 2) argsPreview += ", …";
	} catch {
		argsPreview = toolCall.arguments.slice(0, 40);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box gap={1}>
				<ToolStatusIcon status={status} />
				<Text color={CYAN} bold>
					{toolCall.name}
				</Text>
				<Text color={DIM}>({argsPreview})</Text>
				{label && <Text color={MID}>[{label}]</Text>}
			</Box>
			{status === "done" && result && result.content && (
				<Box marginLeft={3} marginTop={0}>
					<Text color={DIM}>
						{result.content.slice(0, 150)}
						{result.content.length > 150 ? "…" : ""}
					</Text>
				</Box>
			)}
			{status === "error" && result && (
				<Box marginLeft={3} marginTop={0}>
					<Text color={RED}>{result.content.slice(0, 150)}</Text>
				</Box>
			)}
		</Box>
	);
}

// ── System message renderers ──

function SystemText({ content }: { content: string }) {
	return (
		<Box marginBottom={1}>
			<Text color={DIM}>◈ {content}</Text>
		</Box>
	);
}

function CompactBoundary() {
	return (
		<Box marginBottom={1}>
			<Text color={DIM}>
				{"─".repeat(20)} context compressed {"─".repeat(20)}
			</Text>
		</Box>
	);
}

function CompactSummary({ content, expanded: initialExpanded }: { content: string; expanded?: boolean }) {
	const [expanded, setExpanded] = useState(initialExpanded ?? false);
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={GREEN}>● </Text>
				<Text color={MID}>{expanded ? "Full summary" : "Compact summary"}</Text>
				{!expanded && <Text color={CYAN}> (press e to expand)</Text>}
			</Box>
			{expanded && (
				<Box marginLeft={2}>
					<Text color={LIGHT}>{content}</Text>
				</Box>
			)}
		</Box>
	);
}

// ── Main dispatcher ──

export function MessageRenderer({ message }: { message: RichMessage }) {
	switch (message.type) {
		// User
		case "user_text":
			return <UserText content={message.content} />;
		case "user_image":
			return <UserImage alt={message.alt} />;
		case "user_command":
			return <UserCommand command={message.command} args={message.args} />;
		case "user_bash":
			return <UserBash command={message.command} output={message.output} exitCode={message.exitCode} />;
		case "user_tool_success":
			return <UserToolSuccess toolName={message.toolName} content={message.content} />;
		case "user_tool_error":
			return <UserToolError toolName={message.toolName} content={message.content} errorType={message.errorType} />;
		case "user_tool_reject":
			return <UserToolReject toolName={message.toolName} reason={message.reason} />;
		case "attachment":
			return <Attachment fileName={message.fileName} fileType={message.fileType} size={message.size} />;
		case "user_teammate":
			return <UserTeammate agentName={message.agentName} content={message.content} />;
		case "user_plan":
			return <UserPlan content={message.content} />;
		case "user_memory_input":
			return <UserMemoryInput content={message.content} />;
		// Assistant
		case "assistant_text":
			return <AssistantText content={message.content} />;
		case "assistant_thinking":
			return <AssistantThinking content={message.content} expanded={message.expanded} />;
		case "assistant_redacted_thinking":
			return <AssistantRedactedThinking />;
		case "assistant_tool_use":
			return (
				<AssistantToolUse
					toolCall={message.toolCall}
					status={message.status}
					result={message.result}
					label={message.label}
				/>
			);
		// System
		case "system_text":
			return <SystemText content={message.content} />;
		case "compact_boundary":
			return <CompactBoundary />;
		case "compact_summary":
			return <CompactSummary content={message.content} expanded={message.expanded} />;
	}
}
