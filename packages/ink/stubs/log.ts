/**
 * No-op stub replacing Claude Code's internal error logger.
 * Replace with your own logger if needed.
 */
export function logError(_error: Error | unknown): void {
  console.error(_error)
}
