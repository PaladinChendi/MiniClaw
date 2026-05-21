# Bun Proxy require PoC Verdict

Date: 2026-05-21
Bun version: 1.3.14

## Result
- [x] Proxy on require('fs') object works
- [ ] Proxy on require('fs') object does NOT work → Worker fallback

## Evidence
```
fs.readFileSync(/etc/hostname) BLOCKED
Proxy approach: WORKS
module hook available: function
```

## Decision per D1/D40
**PASS** — Proxy sandbox viable for v1.1. Single-process sandbox confirmed.
Module._load hook also available as backup mechanism.
