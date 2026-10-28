import { canonicalJson, sha256Hex } from '../hash'

export const SCALE = 1000

export type Box = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type SpeciesId = 'dog' | 'cat'

export type ThrowKind = 'normal' | 'power' | 'sniping' | 'double'

/**
 * Rules version 1. Tuning placeholders, not a balance claim.
 * Change them only by adding a new rules version. Running matches keep this hash.
 *
 * Fixed-point scale is 1,000. Angles are millidegrees. Speeds are milli-units per second.
 * Integration is explicit Euler: move with the current velocity, then add wind and gravity.
 * Quotients truncate toward zero. Sine and cosine come from the integer degree table.
 *
 * Seed mix, per round attempt:
 * sha256 utf-8 of serverSeed, clientSeed1, clientSeed2, roundSlot, and attempt,
 * joined by newlines. Wind is the first 4 bytes interpreted as a uint32, then
 * `windMin + (uint32 % (windMax - windMin + 1))`.
 * A drawn round's second attempt therefore gets a new wind.
 *
 * Odd round slots start with player 1 (the left pet). Even slots start with player 2.
 * Level does not change stats in this version; callers use level 1 base stats.
 * Intelligence is stored on the snapshot and does not affect damage.
 * Shots are tested only against the defender. The attacker is not a target.
 * A direct hit and a ground crossing on the same step: the earlier parameter wins,
 * and an equal parameter counts as the direct hit.
 */
export const RULES_V1 = {
  version: 1,
  scale: SCALE,
  startingEnergy: 100,
  turnLimitPerPlayer: 20,
  turnTimeoutMs: 15_000,
  maxRounds: 5,
  maxHealsPerRound: 2,
  healAmount: 15,
  oneShotCapNumer: 400,
  oneShotCapDenom: 1000,
  maxZoneDefense: 200,
  powerBaseline: 50,
  powerWeight: 5,
  minStatFactor: 100,
  gravity: 9800,
  timestepMs: 50,
  maxSteps: 400,
  fullPowerSpeed: 7000,
  windMin: -2000,
  windMax: 2000,
  splashRadius: 500,
  arenaWidth: 12_000,
  arenaHeight: 8000,
  muzzleOffsetX: 450,
  muzzleY: 450,
  minPower: 1,
  maxPower: 1000,
  minAngle: 0,
  maxAngle: 90_000,
  actionBase: {
    normal: 15,
    power: 28,
    sniping: 20,
    double: 9,
  },
  energyCost: {
    normal: 0,
    power: 35,
    sniping: 30,
    double: 25,
    heal: 40,
    pass: 0,
  },
  zoneMultiplier: {
    head: 1500,
    body: 1000,
    splash: 500,
    miss: 0,
    snipingHead: 1800,
    powerHead: 1300,
  },
  species: {
    dog: {
      health: 100,
      power: 70,
      intelligence: 50,
      x: 2000,
      facing: 1 as const,
      body: { x0: -340, y0: 0, x1: 340, y1: 300 },
      head: { x0: -230, y0: 320, x1: 230, y1: 540 },
    },
    cat: {
      health: 80,
      power: 55,
      intelligence: 90,
      x: 8000,
      facing: -1 as const,
      body: { x0: -280, y0: 0, x1: 280, y1: 260 },
      head: { x0: -180, y0: 300, x1: 180, y1: 480 },
    },
  },
} as const

export const RULES_HASH_V1 = sha256Hex(canonicalJson(RULES_V1))

export function headAreaShare(species: SpeciesId): number {
  const spec = RULES_V1.species[species]
  const body = boxArea(spec.body)
  const head = boxArea(spec.head)
  return Math.floor((head * SCALE) / (body + head))
}

function boxArea(box: Box): number {
  return (box.x1 - box.x0) * (box.y1 - box.y0)
}
