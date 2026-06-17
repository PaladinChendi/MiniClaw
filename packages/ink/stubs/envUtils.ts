/**
 * Replaces Claude Code's src/utils/envUtils.js
 */
export function isEnvTruthy(val: string | boolean | undefined): boolean {
  if (!val) return false
  if (typeof val === 'boolean') return val
  return ['1', 'true', 'yes', 'on'].includes(val.toLowerCase().trim())
}
