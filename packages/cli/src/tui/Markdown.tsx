import { Box, Text } from "ink";
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
	let last = 0;
	let match: RegExpExecArray | null;
	let key = 0;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
	while ((match = regex.exec(text)) !== null) {
		if (match.index > last) {
			nodes.push(text.slice(last, match.index));
		}
		if (match[2]) {
			nodes.push(
				<Text key={`b-${key}`} bold color={LIGHT}>
					{match[2]}
				</Text>,
			);
		} else if (match[3]) {
			nodes.push(
				<Text key={`c-${key}`} color={CYAN} backgroundColor="#111">
					{" "}
					{match[3]}{" "}
				</Text>,
			);
		} else if (match[4] && match[5]) {
			nodes.push(
				<Text key={`l-${key}`} color={CYAN} underline>
					{match[4]}
				</Text>,
			);
		}
		last = match.index + match[0].length;
		key++;
	}
	if (last < text.length) {
		nodes.push(text.slice(last));
	}
	return nodes;
}

function CodeBlock({ code }: { code: string }) {
	return (
		<Box flexDirection="column" marginTop={0} marginBottom={0}>
			<Text color={DIM}>┌{"─".repeat(46)}</Text>
			{code.split("\n").map((line, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static code lines, order never changes
				<Box key={`cl-${i}`}>
					<Text color={DIM}>│ </Text>
					<Text color={CYAN}>{line}</Text>
				</Box>
			))}
			<Text color={DIM}>└{"─".repeat(46)}</Text>
		</Box>
	);
}

export function Markdown({ children }: MarkdownProps) {
	const blocks: React.ReactNode[] = [];
	const lines = children.split("\n");
	let i = 0;
	let key = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Fenced code block
		if (line.trimStart().startsWith("```")) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			blocks.push(<CodeBlock key={`cb-${key}`} code={codeLines.join("\n")} />);
			i++; // skip closing ```
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
				<Box key={`li-${key}`}>
					<Text>
						{" ".repeat(indent)}
						<Text color={GREEN}>• </Text>
						{parseInline(content)}
					</Text>
				</Box>,
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
				<Box key={`ol-${key}`}>
					<Text>
						{" ".repeat(indent)}
						<Text color={GREEN}>{num}. </Text>
						{parseInline(content)}
					</Text>
				</Box>,
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
