declare module 'react/compiler-runtime' {
  export function c(size: number): unknown[]
}

declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: number[]
    paragraphs: Array<{
      level: number
      start: number
      end: number
    }>
  }
  export default function bidiFactory(): {
    getEmbeddingLevels: (text: string, direction?: string) => EmbeddingLevels
    getReorderSegments: (text: string, direction?: string) => Array<{start: number; end: number; dir: string}>
    getReorderedString: (text: string, direction?: string) => string
  }
}

declare namespace React.JSX {
  interface IntrinsicElements {
    'ink-root': Record<string, unknown>
    'ink-box': Record<string, unknown>
    'ink-text': Record<string, unknown>
    'ink-virtual-text': Record<string, unknown>
    'ink-link': Record<string, unknown>
    'ink-progress': Record<string, unknown>
    'ink-raw-ansi': Record<string, unknown>
  }
}
