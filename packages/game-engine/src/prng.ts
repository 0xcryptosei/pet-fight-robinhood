/** 32-bit mulberry32. Integer operations only, so the stream matches across runtimes. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
}

export function uint32FromHex(hex: string): number {
  return Number.parseInt(hex.slice(0, 8), 16) >>> 0
}
