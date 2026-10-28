import { mulDiv } from './integer'
import { RULES_V1, SCALE, type ThrowKind } from './rules/v1'

export type Zone = 'head' | 'body' | 'splash' | 'miss'

export type DamageInput = {
  action: ThrowKind
  power: number
  attackerPower: number
  defenderMaxHealth: number
  zone: Zone
  /**
   * Thousandths removed from that zone's multiplier. A helmet sets `head` only.
   * Each value is clamped to the rules cap. Other zones stay at 0.
   */
  zoneDefense?: Partial<Record<Zone, number>>
}

export type DamageResult = {
  damage: number
  rawDamage: number
  capped: boolean
  statFactor: number
  zoneMultiplier: number
  defense: number
}

export function statFactor(attackerPower: number): number {
  const raw =
    SCALE + (attackerPower - RULES_V1.powerBaseline) * RULES_V1.powerWeight
  return raw < RULES_V1.minStatFactor ? RULES_V1.minStatFactor : raw
}

export function zoneMultiplier(action: ThrowKind, zone: Zone): number {
  if (zone === 'miss') return RULES_V1.zoneMultiplier.miss
  if (zone === 'body') return RULES_V1.zoneMultiplier.body
  if (zone === 'splash') return RULES_V1.zoneMultiplier.splash
  if (action === 'sniping') return RULES_V1.zoneMultiplier.snipingHead
  if (action === 'power') return RULES_V1.zoneMultiplier.powerHead
  return RULES_V1.zoneMultiplier.head
}

export function clampZoneDefense(defense: number): number {
  if (defense <= 0) return 0
  if (defense > RULES_V1.maxZoneDefense) return RULES_V1.maxZoneDefense
  return Math.trunc(defense)
}

export function oneShotCap(defenderMaxHealth: number): number {
  return mulDiv(
    defenderMaxHealth,
    RULES_V1.oneShotCapNumer,
    RULES_V1.oneShotCapDenom,
  )
}

/**
 * One floor at the end of the product:
 * base(action) * power * statFactor * zoneMultiplier * (1 - zoneDefense).
 */
export function computeDamage(input: DamageInput): DamageResult {
  const defense = clampZoneDefense(input.zoneDefense?.[input.zone] ?? 0)
  const factor = statFactor(input.attackerPower)
  const multiplier = zoneMultiplier(input.action, input.zone)
  const base = RULES_V1.actionBase[input.action]
  const numer =
    base *
    input.power *
    factor *
    multiplier *
    (SCALE - defense)
  const rawDamage = Math.floor(numer / SCALE ** 4)
  const cap = oneShotCap(input.defenderMaxHealth)
  const capped = rawDamage > cap
  return {
    damage: input.zone === 'miss' ? 0 : capped ? rawDamage < 0 ? 0 : cap : rawDamage,
    rawDamage: input.zone === 'miss' ? 0 : rawDamage,
    capped: input.zone === 'miss' ? false : capped,
    statFactor: factor,
    zoneMultiplier: multiplier,
    defense,
  }
}
