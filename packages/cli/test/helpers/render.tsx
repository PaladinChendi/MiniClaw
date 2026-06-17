import { EventEmitter } from "node:events";
import { render } from "@miniclaw/ink";
import type { ReactElement } from "react";

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g;

class MockStdout extends EventEmitter {
	columns = 100;
	rows = 30;
	frames: string[] = [];
	_lastFrame?: string;
	write = (frame: string) => {
		this.frames.push(frame);
		this._lastFrame = frame;
	};
	lastFrame = () => this._lastFrame?.replace(ANSI_RE, "");
}

class MockStderr extends EventEmitter {
	frames: string[] = [];
	_lastFrame?: string;
	write = (frame: string) => {
		this.frames.push(frame);
		this._lastFrame = frame;
	};
	lastFrame = () => this._lastFrame;
}

class MockStdin extends EventEmitter {
	isTTY = true;
	isRaw = false;
	data: string | null = null;
	write = (data: string) => {
		this.data = data;
		this.emit("data", data);
	};
	setRawMode = (mode: boolean) => {
		this.isRaw = mode;
	};
	resume() {}
	pause() {}
	ref() {}
	unref() {}
	read = () => {
		const d = this.data;
		this.data = null;
		return d;
	};
}

export async function testRender(tree: ReactElement) {
	const stdout = new MockStdout();
	const stderr = new MockStderr();
	const stdin = new MockStdin();

	const instance = await render(tree, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stderr: stderr as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		exitOnCtrlC: false,
		patchConsole: false,
	});

	return {
		rerender: instance.rerender,
		unmount: instance.unmount,
		cleanup: instance.cleanup,
		lastFrame: stdout.lastFrame,
		frames: stdout.frames,
		stdin,
	};
}
