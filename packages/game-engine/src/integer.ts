/** Truncating division toward zero. Deterministic for safe integers. */
export function mulDiv(a: number, b: number, denominator: number): number {
  return Math.trunc((a * b) / denominator)
}

/** Floor division that handles negative numerators and denominators. */
export function divFloor(numerator: number, denominator: number): number {
  const quotient = Math.trunc(numerator / denominator)
  const remainder = numerator % denominator
  if (remainder !== 0 && (numerator < 0) !== (denominator < 0)) {
    return quotient - 1
  }
  return quotient
}
