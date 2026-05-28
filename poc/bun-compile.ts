/**
 * PoC: Can we bun compile a simple TypeScript file?
 *
 * Run: bun run poc/bun-compile.ts
 * This creates a compiled binary and tests execution.
 */

import { existsSync, unlinkSync, writeFileSync } from "fs";
import { stat } from "fs/promises";

console.log("=== bun compile PoC ===");
console.log("Bun version:", Bun.version);
console.log("Platform:", process.platform, "Arch:", process.arch);

const sourceFile = "poc/__compile_test_source.ts";
const outFile = `poc/__compile_test_bin_${process.platform}`;

writeFileSync(sourceFile, 'console.log("compiled binary works!");');

try {
	const proc = Bun.spawnSync(["bun", "compile", `--outfile=${outFile}`, sourceFile]);
	if (proc.exitCode === 0 && existsSync(outFile)) {
		console.log("Compile: SUCCESS");
		const run = Bun.spawnSync([outFile]);
		console.log("Run output:", run.stdout.toString().trim());
		const s = await stat(outFile);
		console.log("Binary size:", `${(s.size / 1024 / 1024).toFixed(1)}MB`);
		unlinkSync(outFile);
	} else {
		console.log("Compile: FAILED");
		console.log("stderr:", proc.stderr?.toString().slice(0, 200));
	}
} catch (e: any) {
	console.log("Compile: ERROR", e.message?.slice(0, 200));
} finally {
	try {
		unlinkSync(sourceFile);
	} catch {}
}

console.log("\n=== bun compile PoC COMPLETE ===");
