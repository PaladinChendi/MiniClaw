/**
 * PoC: Can we load and run ONNX Runtime in Bun?
 *
 * Run: bun run poc/bun-onnx.ts
 * If this crashes → WASM fallback or subprocess onnxruntime-cli
 */

console.log("=== Bun + ONNX Runtime PoC ===");
console.log("Bun version:", Bun.version);

try {
	const onnxruntime = require("onnxruntime-node");
	console.log("onnxruntime-node: LOADED");
	console.log("available backends:", (onnxruntime as any).listSupportedBackends?.() ?? "N/A");

	try {
		const session = await onnxruntime.InferenceSession.create("/dev/null");
		console.log("session create: unexpected success");
	} catch (e: any) {
		console.log("session create: expected error (no model):", e.message?.slice(0, 80));
		console.log("ONNX API surface: AVAILABLE");
	}
} catch (e: any) {
	console.log("onnxruntime-node: FAILED TO LOAD");
	console.log("Error:", e.message?.slice(0, 120));
	console.log("Fallback needed: WASM onnxruntime-web or API-mode embedding");
}

console.log("\n=== ONNX PoC COMPLETE ===");
