/**
 * Replaces Claude Code's src/utils/execFileNoThrow.js
 * Returns a Promise of a result object with code and optional input.
 */
import { execFileSync } from 'child_process'

export type ExecResult = {
  code: number
  input?: string
}

export function execFileNoThrow(
  cmd: string,
  args: string[],
  opts?: { timeout?: number; input?: string; useCwd?: boolean },
): Promise<ExecResult> & ExecResult {
  let resolved: ExecResult
  try {
    execFileSync(cmd, args, {
      timeout: opts?.timeout ?? 5000,
      stdio: 'pipe',
      input: opts?.input,
    })
    resolved = { code: 0 }
    if (opts?.input !== undefined) {
      resolved.input = opts.input
    }
  } catch {
    resolved = { code: 1 }
  }

  const promise = Promise.resolve(resolved)
  return Object.assign(promise, resolved)
}
