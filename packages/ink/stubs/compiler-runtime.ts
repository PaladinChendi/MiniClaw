/**
 * React Compiler runtime stub.
 * The real runtime is provided by the react-compiler npm package.
 * This stub provides the minimal `c()` function needed for the
 * compiled output to run without the full compiler runtime.
 */
export function c(size: number): unknown[] {
  return new Array(size).fill(undefined)
}
