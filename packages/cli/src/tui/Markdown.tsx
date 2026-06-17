import { Box, Text } from "@miniclaw/ink";
import type React from "react";

const GREEN = "#00ff41";
const CYAN = "#00d4ff";
const ORANGE = "#ffaa00";
const RED = "#ff4444";
const DIM = "#444";
const MID = "#666";
const LIGHT = "#aaa";

interface MarkdownProps {
	children: string;
}

function parseInline(text: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Split on **bold**, `code`, [link](url)
	const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			nodes.push(text.slice(lastIndex, match.index));
		}
		if (match[2]) {
			// **bold**
			nodes.push(
				<Text key={`b-${match.index}`} bold color={LIGHT}>
					{match[2]}
				</Text>,
			);
		} else if (match[3]) {
			// `code`
			nodes.push(
				<Text key={`c-${match.index}`} color={CYAN} backgroundColor="#111">
					{match[3]}
				</Text>,
			);
		} else if (match[4] && match[5]) {
			// [link](url)
			nodes.push(
				<Text key={`l-${match.index}`} color={CYAN} underline>
					{match[4]}
				</Text>,
			);
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex));
	}
	return nodes.length > 0 ? nodes : [text];
}

export function Markdown({ children }: MarkdownProps) {
	const lines = children.split("\n");
	const blocks: React.ReactNode[] = [];
	let i = 0;
	let key = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Fenced code block
		if (line.startsWith("```")) {
			const lang = line.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```
			const code = codeLines.join("\n");
			blocks.push(
				<Box key={`code-${key}`} flexDirection="column" borderStyle="single" borderColor={DIM} paddingX={1}>
					{lang && (
						<Text color={MID}>{lang}</Text>
					)}
					<Text color={CYAN}>{code}</Text>
				</Box>,
			);
			key++;
			continue;
		}

		// Headers
		if (line.startsWith("### ")) {
			blocks.push(
				<Text key={`h3-${key}`} bold color={CYAN}>
					{line.slice(4)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}
		if (line.startsWith("## ")) {
			blocks.push(
				<Text key={`h2-${key}`} bold color={CYAN}>
					{line.slice(3)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}
		if (line.startsWith("# ")) {
			blocks.push(
				<Text key={`h1-${key}`} bold color={GREEN}>
					{line.slice(2)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}

		// Bullet list
		if (line.match(/^\s*[-*] /)) {
			const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
			const content = line.replace(/^\s*[-*] /, "");
			blocks.push(
				<Text key={`li-${key}`}>
					{" ".repeat(indent)}
					<Text color={GREEN}>• </Text>
					{parseInline(content)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}

		// Numbered list
		if (line.match(/^\s*\d+\. /)) {
			const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
			const numMatch = line.match(/^\s*(\d+)\. /);
			const num = numMatch?.[1] ?? "1";
			const content = line.replace(/^\s*\d+\. /, "");
			blocks.push(
				<Text key={`ol-${key}`}>
					{" ".repeat(indent)}
					<Text color={GREEN}>{num}. </Text>
					{parseInline(content)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}

		// Horizontal rule
		if (line.match(/^---+$/)) {
			blocks.push(
				<Text key={`hr-${key}`} color={DIM}>
					{"─".repeat(50)}
				</Text>,
			);
			i++;
			key++;
			continue;
		}

		// Empty line
		if (line.trim() === "") {
			i++;
			continue;
		}

		// Paragraph
		blocks.push(<Text key={`p-${key}`}>{parseInline(line)}</Text>);
		i++;
		key++;
	}

	return <Box flexDirection="column">{blocks}</Box>;
}
