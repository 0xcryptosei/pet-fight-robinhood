import { describe, expect, it } from 'vitest'
import {
  RULES_V1,
  clampZoneDefense,
  computeDamage,
  headAreaShare,
  oneShotCap,
  statFactor,
  zoneMultiplier,
} from '../src/index'

describe('rules version 1 damage', () => {
  it('matches the spec example when the attacker has a neutral stat factor', () => {
    expect(statFactor(50)).toBe(1000)
    const shared = {
      action: 'normal' as const,
      power: 1000,
      attackerPower: 50,
      defenderMaxHealth: 100,
    }
    expect(computeDamage({ ...shared, zone: 'head' }).damage).toBe(22)
    expect(computeDamage({ ...shared, zone: 'body' }).damage).toBe(15)
    expect(computeDamage({ ...shared, zone: 'splash' }).damage).toBe(7)
    expect(computeDamage({ ...shared, zone: 'miss' }).damage).toBe(0)
  })

  it('deals more damage to the head than the body, and more to the body than splash', () => {
    for (const attackerPower of [45, 50, 55, 70, 75]) {
      const damages = (['head', 'body', 'splash'] as const).map(
        (zone) =>
          computeDamage({
            action: 'normal',
            power: 800,
            attackerPower,
            defenderMaxHealth: 100,
            zone,
          }).damage,
      )
      expect(damages[0]).toBeGreaterThan(damages[1] ?? 0)
      expect(damages[1]).toBeGreaterThan(damages[2] ?? 0)
    }
  })

  it('uses the sniping and power-shot head multipliers', () => {
    expect(zoneMultiplier('sniping', 'head')).toBe(1800)
    expect(zoneMultiplier('power', 'head')).toBe(1300)
    expect(zoneMultiplier('normal', 'head')).toBe(1500)
    expect(zoneMultiplier('double', 'head')).toBe(1500)
    expect(zoneMultiplier('power', 'body')).toBe(1000)
  })

  it('caps a power-shot head hit at 40% of max health', () => {
    const catCap = oneShotCap(RULES_V1.species.cat.health)
    expect(catCap).toBe(32)
    const hit = computeDamage({
      action: 'power',
      power: 1000,
      attackerPower: RULES_V1.species.dog.power,
      defenderMaxHealth: RULES_V1.species.cat.health,
      zone: 'head',
    })
    expect(hit.rawDamage).toBeGreaterThan(catCap)
    expect(hit.capped).toBe(true)
    expect(hit.damage).toBe(catCap)
  })

  it('keeps a helmeted power shot inside the one-shot cap', () => {
    const hit = computeDamage({
      action: 'power',
      power: 1000,
      attackerPower: 70,
      defenderMaxHealth: 80,
      zone: 'head',
      zoneDefense: { head: 999 },
    })
    expect(hit.defense).toBe(RULES_V1.maxZoneDefense)
    expect(hit.damage).toBeLessThanOrEqual(32)
  })

  it('reduces head damage only, and only up to the defense cap', () => {
    const neutral = {
      action: 'normal' as const,
      power: 1000,
      attackerPower: 50,
      defenderMaxHealth: 100,
    }
    const defenses = { head: 133 }
    const helmet = computeDamage({ ...neutral, zone: 'head', zoneDefense: defenses })
    const body = computeDamage({ ...neutral, zone: 'body', zoneDefense: defenses })
    expect(helmet.damage).toBe(19)
    expect(body.damage).toBe(15)
    expect(clampZoneDefense(500)).toBe(200)
    expect(computeDamage({ ...neutral, zone: 'head', zoneDefense: { head: 500 } }).defense).toBe(200)
  })

  it('gives the dog a modest power factor and the cat a smaller one', () => {
    expect(statFactor(70)).toBe(1100)
    expect(statFactor(55)).toBe(1025)
    const dog = computeDamage({
      action: 'normal',
      power: 1000,
      attackerPower: 70,
      defenderMaxHealth: 100,
      zone: 'body',
    })
    const cat = computeDamage({
      action: 'normal',
      power: 1000,
      attackerPower: 55,
      defenderMaxHealth: 100,
      zone: 'body',
    })
    expect(dog.damage).toBeGreaterThan(cat.damage)
    expect(dog.damage).toBe(16)
  })

  it('keeps dog and cat head boxes near a quarter of the target area', () => {
    expect(headAreaShare('dog')).toBeGreaterThanOrEqual(250)
    expect(headAreaShare('dog')).toBeLessThanOrEqual(350)
    expect(headAreaShare('cat')).toBeGreaterThanOrEqual(250)
    expect(headAreaShare('cat')).toBeLessThanOrEqual(350)
    expect(RULES_V1.species.cat.head.x1 - RULES_V1.species.cat.head.x0).toBeLessThan(
      RULES_V1.species.dog.head.x1 - RULES_V1.species.dog.head.x0,
    )
  })
})
