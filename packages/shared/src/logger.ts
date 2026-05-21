const API_KEY_PATTERN = /sk-ant-[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}/g;

function redact(value: unknown): unknown {
	if (typeof value === "string") return value.replace(API_KEY_PATTERN, "[REDACTED]");
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = redact(v);
		return out;
	}
	return value;
}

export interface StructuredLogger {
	debug(msg: string, meta?: Record<string, unknown>): void;
	info(msg: string, meta?: Record<string, unknown>): void;
	warn(msg: string, meta?: Record<string, unknown>): void;
	error(msg: string, meta?: Record<string, unknown>): void;
}

export function createStructuredLogger(
	pluginId: string,
	sink: (line: string) => void = (line) => console.error(line),
): StructuredLogger {
	const log = (level: string, msg: string, meta?: Record<string, unknown>) => {
		const entry = {
			pluginId,
			level,
			ts: Date.now(),
			msg: redact(msg) as string,
			...(meta ? (redact(meta) as Record<string, unknown>) : {}),
		};
		sink(JSON.stringify(entry));
	};
	return {
		debug: (msg, meta) => log("debug", msg, meta),
		info: (msg, meta) => log("info", msg, meta),
		warn: (msg, meta) => log("warn", msg, meta),
		error: (msg, meta) => log("error", msg, meta),
	};
}
