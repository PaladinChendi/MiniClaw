/**
 * Replaces Claude Code's src/utils/intl.js
 * Lazily-initialized Intl.Segmenter for grapheme clustering.
 */
let _gs: Intl.Segmenter | null = null
export function getGraphemeSegmenter(): Intl.Segmenter {
  if (!_gs) _gs = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return _gs
}
