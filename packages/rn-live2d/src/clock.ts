// performance.now() exists on the JS thread and on worklet runtimes, but this
// package's TypeScript lib (esnext, no DOM) doesn't declare it.
type WithPerformance = { performance: { now(): number } }

/** Milliseconds, sub-millisecond precision. */
export function now(): number {
  'worklet'
  // Read globalThis here, not from a module constant: a worklet copies what it
  // captures to its runtime, and the global object can't be copied (it's cyclic).
  return (globalThis as unknown as WithPerformance).performance.now()
}
