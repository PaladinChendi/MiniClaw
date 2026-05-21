# Bun + ONNX Runtime PoC Verdict

Date: 2026-05-21
Bun version: (fill from output)

## Result
- [ ] onnxruntime-node loads and works in Bun
- [ ] onnxruntime-node fails → fallback to onnxruntime-web (WASM) or API mode

## Fallback chain per Risk Register
1. onnxruntime-node (native)
2. onnxruntime-web (WASM)
3. Subprocess onnxruntime-cli
4. API-mode embedding (OpenAI/Cohere)
