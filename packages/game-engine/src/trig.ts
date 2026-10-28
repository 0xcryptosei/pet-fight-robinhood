/**
 * Integer sine table for 0..90 degrees, scaled by 1,000.
 * Generated offline. Authoritative code must not call floating-point trig.
 * Index 30 is 500, index 45 is 707, index 90 is 1000.
 */
export const SIN_DEGREE_MILLI: readonly number[] = [
  0, 17, 35, 52, 70, 87, 105, 122, 139, 156, 174, 191, 208, 225, 242, 259, 276,
  292, 309, 326, 342, 358, 375, 391, 407, 423, 438, 454, 469, 485, 500, 515, 530,
  545, 559, 574, 588, 602, 616, 629, 643, 656, 669, 682, 695, 707, 719, 731, 743,
  755, 766, 777, 788, 799, 809, 819, 829, 839, 848, 857, 866, 875, 883, 891, 899,
  906, 914, 921, 927, 934, 940, 946, 951, 956, 961, 966, 970, 974, 978, 982, 985,
  988, 990, 993, 995, 996, 998, 999, 999, 1000, 1000,
]

/** Angle is millidegrees in 0..90,000. Result is 0..1,000. */
export function sinMilli(angleMilliDeg: number): number {
  if (angleMilliDeg <= 0) return 0
  if (angleMilliDeg >= 90_000) return 1000
  const degree = Math.floor(angleMilliDeg / 1000)
  const fraction = angleMilliDeg % 1000
  const lower = SIN_DEGREE_MILLI[degree] ?? 0
  const upper = SIN_DEGREE_MILLI[degree + 1] ?? 1000
  return Math.floor((lower * (1000 - fraction) + upper * fraction) / 1000)
}

/** Cosine via sin(90° − angle). Result is 0..1,000 for angles in 0..90,000. */
export function cosMilli(angleMilliDeg: number): number {
  return sinMilli(90_000 - angleMilliDeg)
}
