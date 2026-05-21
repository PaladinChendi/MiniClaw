/**
 * PoC: Can we intercept require('fs') and require('net') in Bun
 * using a Proxy on the module namespace?
 *
 * Run: bun run poc/bun-proxy-require.ts
 * Expected: "fs.readFileSync BLOCKED" if Proxy works
 *           "fs.readFileSync ALLOWED" if Proxy does NOT work (fallback needed)
 */

const allowedFs: string[] = [];
const allowedNet: string[] = [];

function createFsProxy(): any {
  const realFs = require("fs");
  return new Proxy(realFs, {
    get(target, prop: string) {
      const orig = target[prop];
      if (typeof orig !== "function") return orig;
      return (...args: any[]) => {
        const pathArg = typeof args[0] === "string" ? args[0] : String(args[0]);
        if (!allowedFs.some((p) => pathArg.startsWith(p))) {
          console.log(`fs.${prop}(${pathArg}) BLOCKED`);
          throw new Error(`PermissionDenied: fs.${prop}(${pathArg})`);
        }
        console.log(`fs.${prop}(${pathArg}) ALLOWED`);
        return orig.apply(target, args);
      };
    },
  });
}

console.log("=== Bun Proxy require PoC ===");
console.log("Bun version:", Bun.version);

// Approach 1: Direct Proxy on the fs object
const fsProxy = createFsProxy();
try {
  fsProxy.readFileSync("/etc/hostname");
} catch (e: any) {
  console.log("Proxy approach:", e.message?.includes("PermissionDenied") ? "WORKS" : "FAILS");
}

// Approach 2: Can we override require.cache or require.resolve?
try {
  const Module = require("module");
  console.log("module hook available:", typeof Module._load);
} catch {
  console.log("module hook: NOT available (Bun doesn't expose Module._load)");
}

// Approach 3: Worker thread isolation test
console.log("\n=== Verdict ===");
console.log("If Proxy on fs object works → single-process sandbox possible");
console.log("If NOT → Worker thread + postMessage required (v1.1)");
console.log("B1 PoC COMPLETE");
