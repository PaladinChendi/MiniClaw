/**
 * Replaces Claude Code's src/utils/env.js
 * Only exposes the `terminal` property that ink actually uses.
 */
export const env = {
  get terminal(): string | undefined {
    return process.env.TERM_PROGRAM
  },
}
