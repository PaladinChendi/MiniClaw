# Bun + ONNX Runtime PoC Verdict

Date: 2026-05-21
Bun version: 1.3.14

## Result
- [ ] onnxruntime-node loads and works in Bun
- [x] onnxruntime-node fails → fallback needed

## Evidence
```
onnxruntime-node: FAILED TO LOAD
Error: Cannot find package 'onnxruntime-node'
```

## Decision
onnxruntime-node not installed (expected — optional dep).
Need to test with `bun add onnxruntime-node` in Phase 3.
Fallback chain per Risk Register:
1. onnxruntime-node (native) — needs Phase 3 PoC with actual install
2. onnxruntime-web (WASM) — likely path for v1
3. Subprocess onnxruntime-cli
4. API-mode embedding (OpenAI/Cohere)
