/** Phase 2 local-play rules. Test credits only. Not a chain escrow. */
export const PHASE2 = {
  reconnectGraceMs: 30_000,
  forfeitTimeouts: 3,
  joinWindowMs: 10 * 60 * 1000,
  startWindowMs: 2 * 60 * 1000,
  settleWindowMs: 30 * 60 * 1000,
  nonceTtlMs: 5 * 60 * 1000,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  faucetHuman: 10_000n,
  decimals: 18,
  stakeTiers: [10, 20, 50, 100, 1000] as const,
  feeBps: 0,
} as const

export type StakeTier = (typeof PHASE2.stakeTiers)[number]

export function isStakeTier(value: number): value is StakeTier {
  return (PHASE2.stakeTiers as readonly number[]).includes(value)
}

export function stakeAmount(tier: StakeTier): bigint {
  return BigInt(tier) * 10n ** BigInt(PHASE2.decimals)
}

export const FAUCET_AMOUNT = PHASE2.faucetHuman * 10n ** BigInt(PHASE2.decimals)

/** Controlled beta. Real-value play stays off. Caps come from spec §9.5 tier C. */
export const PHASE6 = {
  network: 'robinhood-testnet',
  chainId: 46630,
  realValue: false,
  maxSessions: 1_000,
  maxOpenRooms: 500,
} as const
