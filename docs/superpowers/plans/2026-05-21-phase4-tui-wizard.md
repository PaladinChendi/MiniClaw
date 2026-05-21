# Phase 4: TUI + Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a full Neon Cyberpunk TUI built with Ink (React for CLI), featuring 5 interaction states, a 2-step setup wizard, channel selector, slash commands, terminal width adaptation, and scanline effect detection.

**Architecture:** Ink renders a React tree inside the terminal. The `<App>` component manages global state via hooks. Embedded mode reuses Gateway logic without network layer. Components are pure functional React components. Terminal width adaptation uses a `useTerminalSize` hook that listens for resize events.

**Tech Stack:** TypeScript 5.x, React 18, Ink 4.x, Bun 1.3+, @ebsclaw/gateway, @ebsclaw/plugin-api, chalk for ANSI colors

---

## File Structure

```
packages/tui/
  package.json
  tsconfig.json
  src/
    index.ts              — TUI entry, Ink render
    app.tsx               — Root <App> component
    components/
      top-bar.tsx
      message-flow.tsx
      message-item.tsx
      tool-call-item.tsx
      input-line.tsx
      status-bar.tsx
      error-strip.tsx
      compacting-bar.tsx
      setup-wizard.tsx
      channel-selector.tsx
      help-overlay.tsx
      memory-overlay.tsx
      scanline.tsx
    hooks/
      use-session.ts
      use-input.ts
      use-commands.ts
      use-terminal-size.ts
    theme.ts              — Colors, fonts, spacing constants
  test/
    app.test.tsx
    components.test.tsx
    commands.test.ts
    theme.test.ts
```

---

### Task 1: TUI Package Skeleton and Theme Constants

**Files:**
- Create: `packages/tui/package.json`
- Create: `packages/tui/tsconfig.json`
- Create: `packages/tui/src/theme.ts`
- Test: `packages/tui/test/theme.test.ts`

- [ ] **Step 1: Create package.json**

`packages/tui/package.json`:
```json
{
  "name": "@ebsclaw/tui",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "ebsclaw": "src/index.ts"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "ink": "^4.4.1",
    "ink-text-input": "^5.0.1",
    "react": "^18.2.0",
    "chalk": "^5.3.0",
    "@ebsclaw/plugin-api": "workspace:*",
    "@ebsclaw/shared": "workspace:*",
    "@ebsclaw/gateway": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "ink-testing-library": "^3.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

`packages/tui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing theme test**

`packages/tui/test/theme.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { theme, breakpoint, detectScanlineSupport } from "@ebsclaw/tui/theme";

describe("Theme constants", () => {
  it("exports all color tokens", () => {
    expect(theme.colors.neonGreen).toBe("#00ff41");
    expect(theme.colors.cyan).toBe("#00d4ff");
    expect(theme.colors.error).toBe("#ff4444");
    expect(theme.colors.warn).toBe("#ffaa00");
    expect(theme.colors.bg).toBe("#0d0d0d");
  });

  it("exports spacing constants", () => {
    expect(theme.spacing.unit).toBeNumber();
    expect(theme.spacing.maxWidth).toBe(80);
  });

  it("exports font stack with JetBrains Mono primary", () => {
    expect(theme.fonts.primary).toContain("JetBrains Mono");
    expect(theme.fonts.fallback.length).toBeGreaterThan(0);
  });

  it("breakpoint returns correct layout mode", () => {
    expect(breakpoint(40)).toBe("compact");
    expect(breakpoint(80)).toBe("full");
    expect(breakpoint(120)).toBe("wide");
  });

  it("detectScanlineSupport returns boolean", () => {
    const result = detectScanlineSupport();
    expect(typeof result).toBe("boolean");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun install && bun test packages/tui/test/theme.test.ts`
Expected: FAIL -- `@ebsclaw/tui/theme` not found

- [ ] **Step 5: Implement theme.ts**

`packages/tui/src/theme.ts`:
```typescript
export const theme = {
  colors: {
    neonGreen: "#00ff41",
    cyan: "#00d4ff",
    error: "#ff4444",
    warn: "#ffaa00",
    bg: "#0d0d0d",
    muted: "#555555",
    white: "#e0e0e0",
  },
  spacing: {
    unit: 1,
    maxWidth: 80,
    padH: 2,
  },
  fonts: {
    primary: "JetBrains Mono",
    fallback: ["Fira Code", "Cascadia Code", "Consolas", "monospace"],
  },
  borders: {
    user: "#00d4ff",
    agent: "#00ff41",
    tool: "#555555",
    radius: {
      tool: "round" as const,
    },
  },
} as const;

export type LayoutMode = "compact" | "full" | "wide";

export function breakpoint(cols: number): LayoutMode {
  if (cols < 60) return "compact";
  if (cols <= 100) return "full";
  return "wide";
}

export function detectScanlineSupport(): boolean {
  // Scanline effect requires true-color (24-bit) terminal support
  const term = process.env.TERM ?? "";
  const colorterm = process.env.COLORTERM ?? "";
  if (colorterm === "truecolor" || colorterm === "24bit") return true;
  if (term.includes("256color")) return false; // 256color is not enough
  if (term.startsWith("xterm")) return true; // modern xterm usually supports truecolor
  return false;
}
```

- [ ] **Step 6: Run theme tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/theme.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/tui/
git commit -m "feat(tui): add package skeleton with Neon Cyberpunk theme constants"
```

---

### Task 2: Terminal Size Hook and Layout Adaptation

**Files:**
- Create: `packages/tui/src/hooks/use-terminal-size.ts`
- Test: `packages/tui/test/hooks/use-terminal-size.test.ts`

- [ ] **Step 1: Write failing useTerminalSize test**

`packages/tui/test/hooks/use-terminal-size.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { computeLayout, LayoutConfig } from "@ebsclaw/tui/hooks/use-terminal-size";

describe("computeLayout", () => {
  it("compact mode: single column, no status bar plugins", () => {
    const layout = computeLayout(40);
    expect(layout.mode).toBe("compact");
    expect(layout.showStatusBar).toBe(false);
    expect(layout.messageMaxWidth).toBeLessThanOrEqual(38);
  });

  it("full mode: dual columns, full status bar", () => {
    const layout = computeLayout(80);
    expect(layout.mode).toBe("full");
    expect(layout.showStatusBar).toBe(true);
    expect(layout.messageMaxWidth).toBeLessThanOrEqual(80);
  });

  it("wide mode: max-width capped at 80ch", () => {
    const layout = computeLayout(140);
    expect(layout.mode).toBe("wide");
    expect(layout.messageMaxWidth).toBe(80);
  });

  it("handles 0-width gracefully", () => {
    const layout = computeLayout(0);
    expect(layout.mode).toBe("compact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/hooks/use-terminal-size.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useTerminalSize hook**

`packages/tui/src/hooks/use-terminal-size.ts`:
```typescript
import { useState, useEffect } from "react";
import { breakpoint, type LayoutMode } from "../theme";

export interface LayoutConfig {
  mode: LayoutMode;
  cols: number;
  rows: number;
  messageMaxWidth: number;
  showStatusBar: boolean;
  showTopBarPlugins: boolean;
}

const MAX_MESSAGE_WIDTH = 80;

export function computeLayout(cols: number, rows: number = 24): LayoutConfig {
  const mode = breakpoint(cols);
  return {
    mode,
    cols,
    rows,
    messageMaxWidth: mode === "wide" ? MAX_MESSAGE_WIDTH : Math.min(cols - 2, MAX_MESSAGE_WIDTH),
    showStatusBar: mode !== "compact",
    showTopBarPlugins: mode === "full" || mode === "wide",
  };
}

export function useTerminalSize(): LayoutConfig {
  const [layout, setLayout] = useState(() =>
    computeLayout(process.stdout.columns ?? 80, process.stdout.rows ?? 24)
  );

  useEffect(() => {
    const onResize = () => {
      setLayout(computeLayout(process.stdout.columns ?? 80, process.stdout.rows ?? 24));
    };
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  return layout;
}
```

- [ ] **Step 4: Run useTerminalSize tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/hooks/use-terminal-size.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/hooks/ packages/tui/test/hooks/
git commit -m "feat(tui): add useTerminalSize hook with layout adaptation"
```

---

### Task 3: Top Bar Component

**Files:**
- Create: `packages/tui/src/components/top-bar.tsx`
- Test: `packages/tui/test/components/top-bar.test.tsx`

- [ ] **Step 1: Write failing TopBar test**

`packages/tui/test/components/top-bar.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderTopBar } from "@ebsclaw/tui/components/top-bar";

describe("TopBar", () => {
  it("renders logo, session, tokens, percent, model in full mode", () => {
    const lines = renderTopBar({
      sessionId: "s-001",
      tokensUsed: 1234,
      tokenBudget: 5000,
      model: "claude-3.5-sonnet",
      mode: "full",
      cols: 80,
    });
    expect(lines).toContain("ebsclaw");
    expect(lines).toContain("s-001");
    expect(lines).toContain("1.2k");
    expect(lines).toContain("24.7%");
    expect(lines).toContain("claude-3.5-sonnet");
  });

  it("compact mode: only logo and model", () => {
    const lines = renderTopBar({
      sessionId: "s-002",
      tokensUsed: 100,
      tokenBudget: 4000,
      model: "gpt-4o",
      mode: "compact",
      cols: 40,
    });
    expect(lines).toContain("ebsclaw");
    expect(lines).toContain("gpt-4o");
    // Session and percent should be omitted in compact
    expect(lines).not.toContain("24.7%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/top-bar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement TopBar**

`packages/tui/src/components/top-bar.tsx`:
```typescript
import chalk from "chalk";
import type { LayoutMode } from "../theme";

const logo = chalk.hex("#00ff41").bold("ebsclaw");

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export interface TopBarProps {
  sessionId: string;
  tokensUsed: number;
  tokenBudget: number;
  model: string;
  mode: LayoutMode;
  cols: number;
}

export function renderTopBar(props: TopBarProps): string {
  const { sessionId, tokensUsed, tokenBudget, model, mode, cols } = props;
  const pct = ((tokensUsed / tokenBudget) * 100).toFixed(1) + "%";
  const tkn = formatTokens(tokensUsed);

  if (mode === "compact") {
    return `${logo} ${chalk.hex("#555")(model)}`;
  }

  const sessionPart = chalk.hex("#00d4ff")(`[${sessionId}]`);
  const tokenPart = chalk.hex("#e0e0e0")(`${tkn}/${formatTokens(tokenBudget)}`);
  const pctPart = chalk.hex("#ffaa00")(pct);
  const modelPart = chalk.hex("#555")(model);

  return `${logo} ${sessionPart} ${tokenPart} ${pctPart} ${modelPart}`;
}

export function TopBar(props: TopBarProps) {
  const { Box, Text } = require("ink");
  const content = renderTopBar(props);
  return (
    <Box borderStyle="single" borderColor="#00d4ff" paddingX={1}>
      <Text>{content}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run TopBar tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/top-bar.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/components/top-bar.tsx packages/tui/test/components/
git commit -m "feat(tui): add TopBar with logo, session, tokens, model display"
```

---

### Task 4: Message Flow and Message Item Components

**Files:**
- Create: `packages/tui/src/components/message-item.tsx`
- Create: `packages/tui/src/components/tool-call-item.tsx`
- Create: `packages/tui/src/components/message-flow.tsx`
- Test: `packages/tui/test/components/message-flow.test.tsx`

- [ ] **Step 1: Write failing message component test**

`packages/tui/test/components/message-flow.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderMessageItem, renderToolCallItem } from "@ebsclaw/tui/components/message-item";

describe("MessageItem rendering", () => {
  it("user message has cyan border (#00d4ff)", () => {
    const output = renderMessageItem({ role: "user", content: "hello agent" });
    expect(output).toContain("hello agent");
    expect(output).toContain("#00d4ff");
  });

  it("agent message has green border (#00ff41)", () => {
    const output = renderMessageItem({ role: "assistant", content: "hello user" });
    expect(output).toContain("hello user");
    expect(output).toContain("#00ff41");
  });
});

describe("ToolCallItem rendering", () => {
  it("tool call has round border (#555)", () => {
    const output = renderToolCallItem({ name: "readFile", args: { path: "/tmp/test.ts" } });
    expect(output).toContain("readFile");
    expect(output).toContain("#555");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/message-flow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement MessageItem**

`packages/tui/src/components/message-item.tsx`:
```typescript
import chalk from "chalk";

export interface MessageItemProps {
  role: "user" | "assistant" | "system";
  content: string;
  maxWidth?: number;
}

const roleBorders: Record<string, string> = {
  user: "#00d4ff",
  assistant: "#00ff41",
  system: "#555555",
};

const roleLabels: Record<string, string> = {
  user: "YOU",
  assistant: "AGENT",
  system: "SYS",
};

export function renderMessageItem(props: MessageItemProps): string {
  const { role, content, maxWidth = 80 } = props;
  const borderColor = roleBorders[role] ?? "#555555";
  const label = chalk.hex(borderColor).bold(roleLabels[role] ?? role.toUpperCase());

  // Wrap content to maxWidth
  const lines = content.split("\n");
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= maxWidth) {
      wrapped.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxWidth) {
        wrapped.push(line.slice(i, i + maxWidth));
      }
    }
  }

  const body = wrapped.map((l) => chalk.hex("#e0e0e0")(l)).join("\n");
  return `${label} ${body}`;
}

export function renderToolCallItem(props: { name: string; args: Record<string, unknown> }): string {
  const { name, args } = props;
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `${chalk.hex("#555555").italic("TOOL")} ${chalk.hex("#555555")(name)} ${chalk.hex("#555555")(argsStr)}`;
}

export function MessageItem(props: MessageItemProps) {
  const { Box, Text } = require("ink");
  const borderColor = roleBorders[props.role] ?? "#555555";
  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1} marginBottom={0}>
      <Text>{renderMessageItem(props)}</Text>
    </Box>
  );
}

export function ToolCallItem(props: { name: string; args: Record<string, unknown> }) {
  const { Box, Text } = require("ink");
  return (
    <Box borderStyle="round" borderColor="#555555" paddingX={1} marginBottom={0}>
      <Text>{renderToolCallItem(props)}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Implement MessageFlow**

`packages/tui/src/components/message-flow.tsx`:
```typescript
import { MessageItem, ToolCallItem } from "./message-item";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface TimelineItem {
  type: "message" | "tool";
  message?: Message;
  toolCall?: ToolCall;
}

export function MessageFlow({ items }: { items: TimelineItem[] }) {
  const { Box } = require("ink");
  return (
    <Box flexDirection="column" paddingX={1}>
      {items.map((item) =>
        item.type === "message" && item.message ? (
          <MessageItem key={item.message.id} role={item.message.role} content={item.message.content} />
        ) : item.toolCall ? (
          <ToolCallItem key={item.toolCall.id} name={item.toolCall.name} args={item.toolCall.args} />
        ) : null,
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run message flow tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/message-flow.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/components/message-item.tsx packages/tui/src/components/message-flow.tsx
git commit -m "feat(tui): add MessageFlow, MessageItem (colored borders), and ToolCallItem (round border)"
```

---

### Task 5: Input Line with Command History

**Files:**
- Create: `packages/tui/src/hooks/use-input.ts`
- Create: `packages/tui/src/components/input-line.tsx`
- Test: `packages/tui/test/commands.test.ts`

- [ ] **Step 1: Write failing command handling test**

`packages/tui/test/commands.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { parseCommand, COMMANDS } from "@ebsclaw/tui/hooks/use-input";

describe("parseCommand", () => {
  it("parses /compact as compact command", () => {
    const result = parseCommand("/compact");
    expect(result).toEqual({ type: "command", command: "compact" });
  });

  it("parses /help as help command", () => {
    const result = parseCommand("/help");
    expect(result).toEqual({ type: "command", command: "help" });
  });

  it("parses /memory as memory command", () => {
    const result = parseCommand("/memory");
    expect(result).toEqual({ type: "command", command: "memory" });
  });

  it("parses /status as status command", () => {
    const result = parseCommand("/status");
    expect(result).toEqual({ type: "command", command: "status" });
  });

  it("parses /config as config command", () => {
    const result = parseCommand("/config");
    expect(result).toEqual({ type: "command", command: "config" });
  });

  it("parses /exit as exit command", () => {
    const result = parseCommand("/exit");
    expect(result).toEqual({ type: "command", command: "exit" });
  });

  it("non-slash input returns as chat message", () => {
    const result = parseCommand("hello world");
    expect(result).toEqual({ type: "chat", content: "hello world" });
  });

  it("unknown command returns unknown", () => {
    const result = parseCommand("/foobar");
    expect(result).toEqual({ type: "unknown", command: "foobar" });
  });
});

describe("COMMANDS registry", () => {
  it("lists all 6 commands", () => {
    expect(COMMANDS.length).toBe(6);
    expect(COMMANDS.map((c) => c.name)).toEqual(["compact", "help", "memory", "status", "config", "exit"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement use-input hook and command parsing**

`packages/tui/src/hooks/use-input.ts`:
```typescript
import { useState, useCallback } from "react";
import { useInput as inkUseInput } from "ink";

export interface CommandDef {
  name: string;
  description: string;
  aliases?: string[];
}

export const COMMANDS: CommandDef[] = [
  { name: "compact", description: "Force manual context compaction" },
  { name: "help", description: "Show full-screen help overlay" },
  { name: "memory", description: "Show full-screen memory overlay" },
  { name: "status", description: "Show gateway and plugin status" },
  { name: "config", description: "Open configuration panel" },
  { name: "exit", description: "Exit ebsclaw TUI" },
];

const COMMAND_NAMES = new Set(COMMANDS.map((c) => c.name));

export type ParsedInput =
  | { type: "chat"; content: string }
  | { type: "command"; command: string }
  | { type: "unknown"; command: string };

export function parseCommand(line: string): ParsedInput {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return { type: "chat", content: trimmed };

  const cmd = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
  if (COMMAND_NAMES.has(cmd)) return { type: "command", command: cmd };
  return { type: "unknown", command: cmd };
}

export interface UseInputOptions {
  onSubmit: (parsed: ParsedInput) => void;
  maxHistory?: number;
}

export function useInputHandling(options: UseInputOptions) {
  const { onSubmit, maxHistory = 100 } = options;
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const handleSubmit = useCallback(() => {
    if (input.trim().length === 0) return;

    const parsed = parseCommand(input);
    setHistory((prev) => [input, ...prev].slice(0, maxHistory));
    setHistoryIndex(-1);
    setInput("");
    onSubmit(parsed);
  }, [input, onSubmit, maxHistory]);

  const handleHistoryUp = useCallback(() => {
    setHistoryIndex((prev) => {
      const next = Math.min(prev + 1, history.length - 1);
      if (next >= 0) setInput(history[next] ?? "");
      return next;
    });
  }, [history]);

  const handleHistoryDown = useCallback(() => {
    setHistoryIndex((prev) => {
      const next = Math.max(prev - 1, -1);
      if (next === -1) setInput("");
      else setInput(history[next] ?? "");
      return next;
    });
  }, [history]);

  return { input, setInput, handleSubmit, handleHistoryUp, handleHistoryDown };
}
```

- [ ] **Step 4: Implement InputLine component**

`packages/tui/src/components/input-line.tsx`:
```typescript
import chalk from "chalk";

export function InputLine({ value, isActive }: { value: string; isActive: boolean }) {
  const prompt = chalk.hex("#00ff41").bold("> ");
  const cursor = isActive ? chalk.hex("#00ff41")("█") : "";
  return `${prompt}${value}${cursor}`;
}

export function InputLineComponent({ value, isActive }: { value: string; isActive: boolean }) {
  const { Box, Text } = require("ink");
  return (
    <Box borderStyle="single" borderColor="#00d4ff" paddingX={1}>
      <Text>{InputLine({ value, isActive })}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Run command tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/commands.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/hooks/use-input.ts packages/tui/src/components/input-line.tsx packages/tui/test/commands.test.ts
git commit -m "feat(tui): add input line with slash command parsing and history navigation"
```

---

### Task 6: Status Bar Component

**Files:**
- Create: `packages/tui/src/components/status-bar.tsx`
- Test: `packages/tui/test/components/status-bar.test.tsx`

- [ ] **Step 1: Write failing status bar test**

`packages/tui/test/components/status-bar.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderStatusBar } from "@ebsclaw/tui/components/status-bar";

describe("StatusBar", () => {
  it("shows plugins, memories, uptime in full mode", () => {
    const output = renderStatusBar({
      pluginCount: 4,
      memoryCount: 12,
      uptimeMs: 3661000,
      mode: "full",
    });
    expect(output).toContain("4 plugins");
    expect(output).toContain("12 memories");
    expect(output).toContain("1h 1m");
  });

  it("compact mode: only uptime", () => {
    const output = renderStatusBar({
      pluginCount: 2,
      memoryCount: 5,
      uptimeMs: 60000,
      mode: "compact",
    });
    expect(output).toContain("1m");
    expect(output).not.toContain("5 memories");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/status-bar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement StatusBar**

`packages/tui/src/components/status-bar.tsx`:
```typescript
import chalk from "chalk";
import type { LayoutMode } from "../theme";

export interface StatusBarProps {
  pluginCount: number;
  memoryCount: number;
  uptimeMs: number;
  mode: LayoutMode;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function renderStatusBar(props: StatusBarProps): string {
  const { pluginCount, memoryCount, uptimeMs, mode } = props;
  const uptime = formatUptime(uptimeMs);

  if (mode === "compact") {
    return chalk.hex("#555555")(`up ${uptime}`);
  }

  const plugins = chalk.hex("#00d4ff")(`${pluginCount} plugins`);
  const memories = chalk.hex("#00ff41")(`${memoryCount} memories`);
  const up = chalk.hex("#555555")(`up ${uptime}`);

  return `${plugins}  ${memories}  ${up}`;
}

export function StatusBar(props: StatusBarProps) {
  const { Box, Text } = require("ink");
  return (
    <Box borderStyle="single" borderColor="#555555" paddingX={1}>
      <Text>{renderStatusBar(props)}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run status bar tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/status-bar.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/components/status-bar.tsx packages/tui/test/components/status-bar.test.tsx
git commit -m "feat(tui): add StatusBar with plugins, memories, uptime display"
```

---

### Task 7: Error Strip and Compacting Bar Components

**Files:**
- Create: `packages/tui/src/components/error-strip.tsx`
- Create: `packages/tui/src/components/compacting-bar.tsx`
- Test: `packages/tui/test/components/error-compact.test.tsx`

- [ ] **Step 1: Write failing test**

`packages/tui/test/components/error-compact.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderErrorStrip } from "@ebsclaw/tui/components/error-strip";
import { renderCompactingBar } from "@ebsclaw/tui/components/compacting-bar";

describe("ErrorStrip", () => {
  it("renders 429 rate-limit error with red text", () => {
    const output = renderErrorStrip({ statusCode: 429, message: "Rate limited" });
    expect(output).toContain("429");
    expect(output).toContain("Rate limited");
    expect(output).toContain("#ff4444");
  });

  it("renders 5xx server error", () => {
    const output = renderErrorStrip({ statusCode: 502, message: "Bad Gateway" });
    expect(output).toContain("502");
  });

  it("returns empty string when no error", () => {
    const output = renderErrorStrip(null);
    expect(output).toBe("");
  });
});

describe("CompactingBar", () => {
  it("renders neon cyan progress with compacting level", () => {
    const output = renderCompactingBar({
      fromLevel: "L",
      toLevel: "M",
      progress: 0.6,
      elapsedMs: 3400,
    });
    expect(output).toContain("COMPACTING");
    expect(output).toContain("L");
    expect(output).toContain("M");
    expect(output).toContain("60%");
    expect(output).toContain("3.4s");
  });

  it("renders 0% correctly", () => {
    const output = renderCompactingBar({
      fromLevel: "XL",
      toLevel: "S",
      progress: 0,
      elapsedMs: 0,
    });
    expect(output).toContain("0%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/error-compact.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ErrorStrip**

`packages/tui/src/components/error-strip.tsx`:
```typescript
import chalk from "chalk";

export interface ErrorStripProps {
  statusCode: number;
  message: string;
}

export function renderErrorStrip(props: ErrorStripProps | null): string {
  if (!props) return "";

  const { statusCode, message } = props;
  const prefix = statusCode >= 500 ? "SERVER" : statusCode === 429 ? "RATE" : "ERR";
  const colored = chalk.hex("#ff4444").bold(`[${prefix} ${statusCode}] ${message}`);
  return colored;
}

export function ErrorStrip({ error }: { error: ErrorStripProps | null }) {
  const { Box, Text } = require("ink");
  if (!error) return null;
  return (
    <Box borderStyle="bold" borderColor="#ff4444" paddingX={1}>
      <Text>{renderErrorStrip(error)}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Implement CompactingBar**

`packages/tui/src/components/compacting-bar.tsx`:
```typescript
import chalk from "chalk";

export interface CompactingBarProps {
  fromLevel: string;
  toLevel: string;
  progress: number;
  elapsedMs: number;
}

export function renderCompactingBar(props: CompactingBarProps): string {
  const { fromLevel, toLevel, progress, elapsedMs } = props;
  const pct = `${Math.round(progress * 100)}%`;
  const time = `${(elapsedMs / 1000).toFixed(1)}s`;
  const bar = chalk.hex("#00d4ff")(
    `◈ COMPACTING · ${fromLevel}→${toLevel} · ${pct} · ${time}`
  );
  return bar;
}

export function CompactingBar(props: CompactingBarProps) {
  const { Box, Text } = require("ink");
  return (
    <Box paddingX={1}>
      <Text>{renderCompactingBar(props)}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Run error/compact tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/error-compact.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/components/error-strip.tsx packages/tui/src/components/compacting-bar.tsx packages/tui/test/components/error-compact.test.tsx
git commit -m "feat(tui): add ErrorStrip (auto-fade 3s) and CompactingBar (neon cyan progress)"
```

---

### Task 8: Help and Memory Full-Screen Overlays

**Files:**
- Create: `packages/tui/src/components/help-overlay.tsx`
- Create: `packages/tui/src/components/memory-overlay.tsx`
- Test: `packages/tui/test/components/overlays.test.tsx`

- [ ] **Step 1: Write failing overlay test**

`packages/tui/test/components/overlays.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderHelpOverlay } from "@ebsclaw/tui/components/help-overlay";
import { renderMemoryOverlay } from "@ebsclaw/tui/components/memory-overlay";

describe("HelpOverlay", () => {
  it("renders all 6 commands with descriptions", () => {
    const lines = renderHelpOverlay();
    expect(lines).toContain("/compact");
    expect(lines).toContain("/help");
    expect(lines).toContain("/memory");
    expect(lines).toContain("/status");
    expect(lines).toContain("/config");
    expect(lines).toContain("/exit");
  });

  it("has ebsclaw branding", () => {
    const lines = renderHelpOverlay();
    expect(lines).toContain("ebsclaw");
  });
});

describe("MemoryOverlay", () => {
  it("renders memory entries", () => {
    const entries = [
      { name: "pref-vim", description: "user prefers Vim", type: "user" as const },
      { name: "no-mock", description: "no mock databases", type: "feedback" as const },
    ];
    const lines = renderMemoryOverlay(entries);
    expect(lines).toContain("pref-vim");
    expect(lines).toContain("no-mock");
  });

  it("shows empty state when no memories", () => {
    const lines = renderMemoryOverlay([]);
    expect(lines).toContain("No memories");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/overlays.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement HelpOverlay**

`packages/tui/src/components/help-overlay.tsx`:
```typescript
import chalk from "chalk";
import { COMMANDS } from "../hooks/use-input";

export function renderHelpOverlay(): string {
  const lines: string[] = [];
  lines.push(chalk.hex("#00ff41").bold("  ebsclaw — Help"));
  lines.push(chalk.hex("#555555")("  ──────────────────────────────"));
  lines.push("");

  for (const cmd of COMMANDS) {
    const name = chalk.hex("#00d4ff").bold(`  /${cmd.name}`);
    const desc = chalk.hex("#e0e0e0")(`  ${cmd.description}`);
    lines.push(`${name.padEnd(20)}${desc}`);
  }

  lines.push("");
  lines.push(chalk.hex("#555555")("  Press ESC or q to close"));
  return lines.join("\n");
}

export function HelpOverlay() {
  const { Box, Text } = require("ink");
  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="#00d4ff">
      <Text>{renderHelpOverlay()}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Implement MemoryOverlay**

`packages/tui/src/components/memory-overlay.tsx`:
```typescript
import chalk from "chalk";
import type { MemoryType } from "@ebsclaw/plugin-api";

export interface MemoryOverlayEntry {
  name: string;
  description: string;
  type: MemoryType;
}

export function renderMemoryOverlay(entries: MemoryOverlayEntry[]): string {
  const lines: string[] = [];
  lines.push(chalk.hex("#00ff41").bold("  ebsclaw — Memories"));
  lines.push(chalk.hex("#555555")("  ──────────────────────────────"));
  lines.push("");

  if (entries.length === 0) {
    lines.push(chalk.hex("#555555")("  No memories stored yet."));
    lines.push("");
    lines.push(chalk.hex("#555555")("  Memories are extracted automatically after conversations."));
    lines.push(chalk.hex("#555555")("  Press ESC or q to close"));
    return lines.join("\n");
  }

  const typeColors: Record<string, string> = {
    user: "#00d4ff",
    feedback: "#ffaa00",
    project: "#00ff41",
    reference: "#e0e0e0",
  };

  for (const entry of entries) {
    const color = typeColors[entry.type] ?? "#555555";
    const tag = chalk.hex(color).bold(`[${entry.type}]`);
    const name = chalk.hex("#e0e0e0")(entry.name);
    const desc = chalk.hex("#555555")(entry.description);
    lines.push(`  ${tag} ${name} — ${desc}`);
  }

  lines.push("");
  lines.push(chalk.hex("#555555")(`  ${entries.length} memories total`));
  lines.push(chalk.hex("#555555")("  Press ESC or q to close"));
  return lines.join("\n");
}

export function MemoryOverlay({ entries }: { entries: MemoryOverlayEntry[] }) {
  const { Box, Text } = require("ink");
  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="#00ff41">
      <Text>{renderMemoryOverlay(entries)}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Run overlay tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/overlays.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/components/help-overlay.tsx packages/tui/src/components/memory-overlay.tsx packages/tui/test/components/overlays.test.tsx
git commit -m "feat(tui): add HelpOverlay and MemoryOverlay full-screen overlays"
```

---

### Task 9: Setup Wizard (2-Step) and Channel Selector

**Files:**
- Create: `packages/tui/src/components/setup-wizard.tsx`
- Create: `packages/tui/src/components/channel-selector.tsx`
- Create: `packages/tui/src/hooks/use-session.ts`
- Test: `packages/tui/test/components/setup-wizard.test.tsx`

- [ ] **Step 1: Write failing setup wizard test**

`packages/tui/test/components/setup-wizard.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderSetupStep } from "@ebsclaw/tui/components/setup-wizard";
import { renderChannelList } from "@ebsclaw/tui/components/channel-selector";

describe("Setup Wizard", () => {
  it("Step 1 renders LLM provider selection", () => {
    const output = renderSetupStep({ step: 1, providers: ["Anthropic", "OpenAI", "Google"] });
    expect(output).toContain("Step 1");
    expect(output).toContain("LLM Provider");
    expect(output).toContain("Anthropic");
    expect(output).toContain("OpenAI");
    expect(output).toContain("Google");
  });

  it("Step 2 renders channel selection", () => {
    const output = renderSetupStep({ step: 2, selectedProvider: "Anthropic" });
    expect(output).toContain("Step 2");
    expect(output).toContain("Channel");
  });
});

describe("Channel Selector", () => {
  it("lists QQ Bot as implemented, others as stubs with greyed text", () => {
    const channels = [
      { id: "qqbot", name: "QQ Bot", status: "implemented" as const },
      { id: "slack", name: "Slack", status: "stub" as const },
      { id: "discord", name: "Discord", status: "stub" as const },
      { id: "telegram", name: "Telegram", status: "stub" as const },
    ];
    const output = renderChannelList(channels);
    expect(output).toContain("QQ Bot");
    expect(output).toContain("Slack");
    expect(output).toContain("即将上线"); // "即将上线" for stubs
  });

  it("implemented channels are selectable, stubs show greyed", () => {
    const channels = [
      { id: "qqbot", name: "QQ Bot", status: "implemented" as const },
      { id: "slack", name: "Slack", status: "stub" as const },
    ];
    const output = renderChannelList(channels);
    expect(output).toContain("QQ Bot");
    expect(output).toContain("即将上线");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/setup-wizard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SetupWizard**

`packages/tui/src/components/setup-wizard.tsx`:
```typescript
import chalk from "chalk";

export interface SetupStepProps {
  step: number;
  providers?: string[];
  selectedProvider?: string;
  selectedChannel?: string;
  apikeyEntered?: boolean;
}

export function renderSetupStep(props: SetupStepProps): string {
  const lines: string[] = [];
  lines.push(chalk.hex("#00ff41").bold("  ebsclaw — Setup Wizard"));
  lines.push(chalk.hex("#555555")("  ──────────────────────────────"));
  lines.push("");

  if (props.step === 1) {
    lines.push(chalk.hex("#00d4ff").bold("  Step 1: LLM Provider"));
    lines.push("");
    const providers = props.providers ?? ["Anthropic", "OpenAI", "Google"];
    for (let i = 0; i < providers.length; i++) {
      const num = chalk.hex("#00ff41").bold(`  [${i + 1}]`);
      const name = chalk.hex("#e0e0e0")(` ${providers[i]}`);
      lines.push(`${num}${name}`);
    }
    lines.push("");
    lines.push(chalk.hex("#555555")("  Enter number or name, then paste API key"));
  } else if (props.step === 2) {
    lines.push(chalk.hex("#00d4ff").bold("  Step 2: Channel"));
    lines.push("");
    lines.push(chalk.hex("#555555")(`  Provider: ${props.selectedProvider ?? "?"}`));
    lines.push("");
    lines.push(chalk.hex("#00ff41").bold("  [1]") + chalk.hex("#e0e0e0")(" QQ Bot"));
    lines.push(chalk.hex("#555555")("  [2] Slack — 即将上线"));
    lines.push(chalk.hex("#555555")("  [3] Discord — 即将上线"));
    lines.push(chalk.hex("#555555")("  [4] Telegram — 即将上线"));
    lines.push("");
    lines.push(chalk.hex("#555555")("  Enter number to select, or press Enter to skip"));
  }

  return lines.join("\n");
}

export function SetupWizard(props: SetupStepProps & { onSelect: (value: string) => void }) {
  const { Box, Text } = require("ink");
  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="#00ff41">
      <Text>{renderSetupStep(props)}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Implement ChannelSelector**

`packages/tui/src/components/channel-selector.tsx`:
```typescript
import chalk from "chalk";

export interface ChannelEntry {
  id: string;
  name: string;
  status: "implemented" | "stub";
}

export function renderChannelList(channels: ChannelEntry[]): string {
  const lines: string[] = [];

  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const num = chalk.hex("#00ff41").bold(`  [${i + 1}]`);
    if (ch.status === "implemented") {
      const name = chalk.hex("#e0e0e0")(` ${ch.name}`);
      lines.push(`${num}${name}`);
    } else {
      const name = chalk.hex("#555555")(` ${ch.name} — 即将上线`);
      lines.push(`${num}${name}`);
    }
  }

  return lines.join("\n");
}

export function ChannelSelector({
  channels,
  onSelect,
}: {
  channels: ChannelEntry[];
  onSelect: (id: string) => void;
}) {
  const { Box, Text } = require("ink");
  return (
    <Box flexDirection="column" padding={1}>
      <Text>{renderChannelList(channels)}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Implement useSession hook**

`packages/tui/src/hooks/use-session.ts`:
```typescript
import { useState, useCallback } from "react";
import type { MemoryType } from "@ebsclaw/plugin-api";

export type AppState = "idle" | "generating" | "compacting" | "error" | "empty";

export interface SessionState {
  state: AppState;
  sessionId: string | null;
  messages: Array<{ id: string; role: "user" | "assistant" | "system"; content: string }>;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tokensUsed: number;
  tokenBudget: number;
  model: string;
  pluginCount: number;
  memoryCount: number;
  startTime: number;
  error: { statusCode: number; message: string } | null;
  compacting: { fromLevel: string; toLevel: string; progress: number; elapsedMs: number } | null;
  showHelp: boolean;
  showMemory: boolean;
  setupStep: number;
  selectedProvider: string | null;
}

const INITIAL_STATE: SessionState = {
  state: "empty",
  sessionId: null,
  messages: [],
  toolCalls: [],
  tokensUsed: 0,
  tokenBudget: 100000,
  model: "unknown",
  pluginCount: 0,
  memoryCount: 0,
  startTime: Date.now(),
  error: null,
  compacting: null,
  showHelp: false,
  showMemory: false,
  setupStep: 0,
  selectedProvider: null,
};

export function useSession() {
  const [session, setSession] = useState<SessionState>(INITIAL_STATE);

  const addMessage = useCallback((msg: { role: "user" | "assistant" | "system"; content: string }) => {
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: `msg_${Date.now()}`, ...msg }],
      state: msg.role === "user" ? "generating" : "idle",
    }));
  }, []);

  const addToolCall = useCallback((tc: { name: string; args: Record<string, unknown> }) => {
    setSession((prev) => ({
      ...prev,
      toolCalls: [...prev.toolCalls, { id: `tc_${Date.now()}`, ...tc }],
    }));
  }, []);

  const setError = useCallback((statusCode: number, message: string) => {
    setSession((prev) => ({ ...prev, state: "error", error: { statusCode, message } }));
  }, []);

  const clearError = useCallback(() => {
    setSession((prev) => ({ ...prev, state: "idle", error: null }));
  }, []);

  const setCompacting = useCallback(
    (fromLevel: string, toLevel: string) => {
      setSession((prev) => ({
        ...prev,
        state: "compacting",
        compacting: { fromLevel, toLevel, progress: 0, elapsedMs: 0 },
      }));
    },
    [],
  );

  const updateCompactingProgress = useCallback((progress: number, elapsedMs: number) => {
    setSession((prev) => ({
      ...prev,
      compacting: prev.compacting ? { ...prev.compacting, progress, elapsedMs } : null,
    }));
  }, []);

  const finishCompacting = useCallback(() => {
    setSession((prev) => ({ ...prev, state: "idle", compacting: null }));
  }, []);

  const toggleHelp = useCallback(() => {
    setSession((prev) => ({ ...prev, showHelp: !prev.showHelp, showMemory: false }));
  }, []);

  const toggleMemory = useCallback(() => {
    setSession((prev) => ({ ...prev, showMemory: !prev.showMemory, showHelp: false }));
  }, []);

  const setSetupStep = useCallback((step: number, provider?: string) => {
    setSession((prev) => ({
      ...prev,
      setupStep: step,
      selectedProvider: provider ?? prev.selectedProvider,
      state: step === 0 ? "empty" : "idle",
    }));
  }, []);

  return {
    session,
    addMessage,
    addToolCall,
    setError,
    clearError,
    setCompacting,
    updateCompactingProgress,
    finishCompacting,
    toggleHelp,
    toggleMemory,
    setSetupStep,
  };
}
```

- [ ] **Step 6: Run setup wizard tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/setup-wizard.test.tsx`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/tui/src/components/setup-wizard.tsx packages/tui/src/components/channel-selector.tsx packages/tui/src/hooks/use-session.ts packages/tui/test/components/setup-wizard.test.tsx
git commit -m "feat(tui): add 2-step setup wizard, channel selector (stubs greyed), and useSession hook"
```

---

### Task 10: Scanline Effect Component

**Files:**
- Create: `packages/tui/src/components/scanline.tsx`
- Test: `packages/tui/test/components/scanline.test.tsx`

- [ ] **Step 1: Write failing scanline test**

`packages/tui/test/components/scanline.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { renderScanline } from "@ebsclaw/tui/components/scanline";

describe("Scanline", () => {
  it("returns empty string when terminal does not support truecolor", () => {
    const output = renderScanline(false, 80);
    expect(output).toBe("");
  });

  it("returns scanline overlay string when supported", () => {
    const output = renderScanline(true, 40);
    expect(output.length).toBeGreaterThan(0);
  });

  it("respects width parameter", () => {
    const output = renderScanline(true, 20);
    // Should not exceed width characters per line
    const lines = output.split("\n");
    for (const line of lines) {
      // Strip ANSI codes for length check
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
      expect(stripped.length).toBeLessThanOrEqual(20);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/scanline.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Scanline**

`packages/tui/src/components/scanline.tsx`:
```typescript
import chalk from "chalk";

/**
 * Renders a scanline overlay effect for Cyberpunk aesthetic.
 * Only active when terminal supports true-color (24-bit).
 * Uses low-opacity dark lines over the content area.
 */
export function renderScanline(supported: boolean, width: number, height: number = 1): string {
  if (!supported) return "";

  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    // Alternate rows: every other row gets a dim overlay
    if (row % 2 === 0) {
      const line = chalk.bgHex("#0d0d0d").hex("#0d0d0d")(" ".repeat(width));
      lines.push(line);
    } else {
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function Scanline({ supported, width, height }: { supported: boolean; width: number; height?: number }) {
  const { Box, Text } = require("ink");
  if (!supported) return null;
  return (
    <Box position="absolute" top={0} left={0} width={width} height={height} opacity={0.1}>
      <Text>{renderScanline(supported, width, height)}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run scanline tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/components/scanline.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/components/scanline.tsx packages/tui/test/components/scanline.test.tsx
git commit -m "feat(tui): add scanline effect component with truecolor auto-detection"
```

---

### Task 11: Root App Component and TUI Entry Point

**Files:**
- Create: `packages/tui/src/app.tsx`
- Create: `packages/tui/src/index.ts`
- Test: `packages/tui/test/app.test.tsx`

- [ ] **Step 1: Write failing App component test**

`packages/tui/test/app.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test";
import { computeAppLayout } from "@ebsclaw/tui/app";

describe("App layout computation", () => {
  it("empty state shows setup wizard when no provider configured", () => {
    const layout = computeAppLayout({
      state: "empty",
      setupStep: 0,
      selectedProvider: null,
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(layout.showSetupWizard).toBe(true);
    expect(layout.showChat).toBe(false);
  });

  it("idle state shows chat with top bar and status bar in full mode", () => {
    const layout = computeAppLayout({
      state: "idle",
      setupStep: 0,
      selectedProvider: "Anthropic",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(layout.showSetupWizard).toBe(false);
    expect(layout.showChat).toBe(true);
    expect(layout.showTopBar).toBe(true);
    expect(layout.showStatusBar).toBe(true);
  });

  it("generating state shows chat without input active", () => {
    const layout = computeAppLayout({
      state: "generating",
      setupStep: 0,
      selectedProvider: "OpenAI",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(layout.showChat).toBe(true);
    expect(layout.inputActive).toBe(false);
  });

  it("compacting state shows compacting bar", () => {
    const layout = computeAppLayout({
      state: "compacting",
      setupStep: 0,
      selectedProvider: "Anthropic",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(layout.showCompactingBar).toBe(true);
  });

  it("error state shows error strip", () => {
    const layout = computeAppLayout({
      state: "error",
      setupStep: 0,
      selectedProvider: "Google",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(layout.showErrorStrip).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/app.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement App component**

`packages/tui/src/app.tsx`:
```typescript
import type { AppState } from "./hooks/use-session";
import type { LayoutMode } from "./theme";
import { breakpoint } from "./theme";
import { detectScanlineSupport } from "./theme";

export interface AppLayoutInput {
  state: AppState;
  setupStep: number;
  selectedProvider: string | null;
  cols: number;
  rows: number;
  scanlineSupported: boolean;
}

export interface AppLayout {
  showSetupWizard: boolean;
  showChat: boolean;
  showTopBar: boolean;
  showStatusBar: boolean;
  showErrorStrip: boolean;
  showCompactingBar: boolean;
  showHelpOverlay: boolean;
  showMemoryOverlay: boolean;
  showScanline: boolean;
  inputActive: boolean;
  layoutMode: LayoutMode;
}

export function computeAppLayout(input: AppLayoutInput): AppLayout {
  const mode = breakpoint(input.cols);

  // Unconfigured — show setup wizard
  if (input.state === "empty" || input.setupStep > 0) {
    return {
      showSetupWizard: true,
      showChat: false,
      showTopBar: false,
      showStatusBar: false,
      showErrorStrip: false,
      showCompactingBar: false,
      showHelpOverlay: false,
      showMemoryOverlay: false,
      showScanline: input.scanlineSupported,
      inputActive: true,
      layoutMode: mode,
    };
  }

  return {
    showSetupWizard: false,
    showChat: true,
    showTopBar: true,
    showStatusBar: mode !== "compact",
    showErrorStrip: input.state === "error",
    showCompactingBar: input.state === "compacting",
    showHelpOverlay: false, // toggled by /help command
    showMemoryOverlay: false, // toggled by /memory command
    showScanline: input.scanlineSupported,
    inputActive: input.state === "idle",
    layoutMode: mode,
  };
}

export function App() {
  const React = require("react");
  const { useSession } = require("./hooks/use-session");
  const { useTerminalSize } = require("./hooks/use-terminal-size");
  const { useInputHandling } = require("./hooks/use-input");
  const { Box, Text, render } = require("ink");

  const { session, addMessage, setError, clearError, setCompacting, finishCompacting, toggleHelp, toggleMemory, setSetupStep } = useSession();
  const layout = useTerminalSize();
  const scanlineSupported = detectScanlineSupport();

  const appLayout = computeAppLayout({
    state: session.state,
    setupStep: session.setupStep,
    selectedProvider: session.selectedProvider,
    cols: layout.cols,
    rows: layout.rows,
    scanlineSupported,
  });

  return (
    <Box flexDirection="column" height={layout.rows}>
      {appLayout.showTopBar && (
        <Box>
          <Text>
            TopBar
          </Text>
        </Box>
      )}
      {appLayout.showChat && (
        <Box flexGrow={1}>
          <Text>Chat Area</Text>
        </Box>
      )}
      {appLayout.showSetupWizard && (
        <Box flexGrow={1}>
          <Text>Setup Wizard</Text>
        </Box>
      )}
      {appLayout.showCompactingBar && (
        <Box>
          <Text>Compacting...</Text>
        </Box>
      )}
      {appLayout.showErrorStrip && (
        <Box>
          <Text>Error</Text>
        </Box>
      )}
      {appLayout.showStatusBar && (
        <Box>
          <Text>StatusBar</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Implement TUI entry point**

`packages/tui/src/index.ts`:
```typescript
#!/usr/bin/env bun
/**
 * ebsclaw TUI entry point
 *
 * Runs in Embedded mode by default (reuses Gateway logic, no network layer).
 * Gateway mode (--mode gateway) connects via WS RPC (v1.1).
 */

import { render } from "ink";
import { App } from "./app";

export function startTUI(): void {
  const { waitUntilExit } = render(<App />);
  waitUntilExit.then(() => {
    process.exit(0);
  });
}

// Auto-start when run directly
if (import.meta.main) {
  startTUI();
}
```

- [ ] **Step 5: Run App tests**

Run: `cd /mnt/d/ebsclaw && bun test packages/tui/test/app.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/app.tsx packages/tui/src/index.ts packages/tui/test/app.test.tsx
git commit -m "feat(tui): add root App component with layout computation and TUI entry point"
```

---

### Task 12: Full TUI Integration Test

**Files:**
- Create: `tests/integration/tui-render.test.ts`

- [ ] **Step 1: Write TUI integration test**

`tests/integration/tui-render.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { computeAppLayout } from "@ebsclaw/tui/app";
import { renderTopBar } from "@ebsclaw/tui/components/top-bar";
import { renderStatusBar } from "@ebsclaw/tui/components/status-bar";
import { renderHelpOverlay } from "@ebsclaw/tui/components/help-overlay";
import { renderMemoryOverlay } from "@ebsclaw/tui/components/memory-overlay";
import { renderErrorStrip } from "@ebsclaw/tui/components/error-strip";
import { renderCompactingBar } from "@ebsclaw/tui/components/compacting-bar";
import { renderSetupStep } from "@ebsclaw/tui/components/setup-wizard";
import { renderChannelList } from "@ebsclaw/tui/components/channel-selector";

describe("TUI full render pipeline", () => {
  it("renders all components without throwing for a configured session", () => {
    const layout = computeAppLayout({
      state: "idle",
      setupStep: 0,
      selectedProvider: "Anthropic",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });

    expect(layout.showChat).toBe(true);
    expect(layout.showTopBar).toBe(true);
    expect(layout.showStatusBar).toBe(true);

    // Render each component and ensure no throw
    const topBar = renderTopBar({
      sessionId: "s-int",
      tokensUsed: 5000,
      tokenBudget: 100000,
      model: "claude-3.5-sonnet",
      mode: "full",
      cols: 80,
    });
    expect(topBar.length).toBeGreaterThan(0);

    const statusBar = renderStatusBar({
      pluginCount: 5,
      memoryCount: 20,
      uptimeMs: 300000,
      mode: "full",
    });
    expect(statusBar.length).toBeGreaterThan(0);

    const help = renderHelpOverlay();
    expect(help.length).toBeGreaterThan(0);

    const memory = renderMemoryOverlay([
      { name: "test", description: "test memory", type: "user" },
    ]);
    expect(memory.length).toBeGreaterThan(0);
  });

  it("renders error and compacting states", () => {
    const errLayout = computeAppLayout({
      state: "error",
      setupStep: 0,
      selectedProvider: "OpenAI",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(errLayout.showErrorStrip).toBe(true);

    const error = renderErrorStrip({ statusCode: 429, message: "Rate limited" });
    expect(error).toContain("429");

    const compactLayout = computeAppLayout({
      state: "compacting",
      setupStep: 0,
      selectedProvider: "OpenAI",
      cols: 80,
      rows: 24,
      scanlineSupported: false,
    });
    expect(compactLayout.showCompactingBar).toBe(true);

    const compactBar = renderCompactingBar({
      fromLevel: "L",
      toLevel: "M",
      progress: 0.75,
      elapsedMs: 5000,
    });
    expect(compactBar).toContain("COMPACTING");
  });

  it("renders setup wizard flow", () => {
    const step1 = renderSetupStep({ step: 1, providers: ["Anthropic", "OpenAI", "Google"] });
    expect(step1).toContain("Step 1");

    const step2 = renderSetupStep({ step: 2, selectedProvider: "Anthropic" });
    expect(step2).toContain("Step 2");

    const channels = renderChannelList([
      { id: "qqbot", name: "QQ Bot", status: "implemented" },
      { id: "slack", name: "Slack", status: "stub" },
    ]);
    expect(channels).toContain("QQ Bot");
    expect(channels).toContain("即将上线");
  });
});
```

- [ ] **Step 2: Run TUI integration test**

Run: `cd /mnt/d/ebsclaw && bun test tests/integration/tui-render.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tui-render.test.ts
git commit -m "test(integration): add TUI full render pipeline integration test"
```

---

## Spec Coverage Checklist

| Phase 4 Deliverable | Task | Artifact |
|---------------------|------|----------|
| TUI with Ink (React for CLI) | T1, T11 | `packages/tui/src/` |
| 5 interaction states | T11 | `computeAppLayout` in `app.tsx` |
| Top bar (logo+session+tokens+%+model) | T3 | `components/top-bar.tsx` |
| Message flow (colored borders) | T4 | `components/message-item.tsx`, `message-flow.tsx` |
| Input line with command history | T5 | `hooks/use-input.ts`, `components/input-line.tsx` |
| Status bar (plugins+memories+uptime) | T6 | `components/status-bar.tsx` |
| /compact, /help, /memory, /status, /config, /exit | T5 | `hooks/use-input.ts` COMMANDS |
| /help full-screen overlay | T8 | `components/help-overlay.tsx` |
| /memory full-screen overlay | T8 | `components/memory-overlay.tsx` |
| 2-step setup wizard | T9 | `components/setup-wizard.tsx` |
| Channel selector (stubs greyed) | T9 | `components/channel-selector.tsx` |
| Compacting progress bar | T7 | `components/compacting-bar.tsx` |
| Error strip (429/5xx, auto-fade) | T7 | `components/error-strip.tsx` |
| Terminal width adaptation | T2 | `hooks/use-terminal-size.ts` |
| Scanline effect | T10 | `components/scanline.tsx` |
| Font stack (JetBrains Mono) | T1 | `theme.ts` |
