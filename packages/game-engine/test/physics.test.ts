import { describe, expect, it } from 'vitest'
import {
  RULES_V1,
  cosMilli,
  groundZone,
  resolveDirectHit,
  simulateThrow,
  sinMilli,
} from '../src/index'
import { SIN_DEGREE_MILLI } from '../src/trig'
import type { Zone } from '../src/damage'

const cat = RULES_V1.species.cat
const dog = RULES_V1.species.dog

function dogThrow(angle: number, wind = 0) {
  return simulateThrow({
    originX: dog.x + RULES_V1.muzzleOffsetX,
    originY: RULES_V1.muzzleY,
    facing: 1,
    power: 1000,
    angle,
    wind,
    defenderX: cat.x,
    defenderHead: cat.head,
    defenderBody: cat.body,
  })
}

describe('fixed-point trig', () => {
  it('uses the committed degree table', () => {
    expect(SIN_DEGREE_MILLI).toHaveLength(91)
    expect(SIN_DEGREE_MILLI[0]).toBe(0)
    expect(SIN_DEGREE_MILLI[30]).toBe(500)
    expect(SIN_DEGREE_MILLI[45]).toBe(707)
    expect(SIN_DEGREE_MILLI[90]).toBe(1000)
    expect(sinMilli(0)).toBe(0)
    expect(sinMilli(30_000)).toBe(500)
    expect(sinMilli(45_000)).toBe(707)
    expect(sinMilli(90_000)).toBe(1000)
    expect(cosMilli(0)).toBe(1000)
    expect(cosMilli(90_000)).toBe(0)
  })
})

describe('hit zone resolution', () => {
  it('resolves an earlier head contact before the body', () => {
    const hit = resolveDirectHit(50, 120, 50, 40, { x0: 0, y0: 100, x1: 100, y1: 160 }, {
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 100,
    })
    expect(hit?.zone).toBe('head')
  })

  it('resolves an earlier body contact before the head', () => {
    const hit = resolveDirectHit(50, 40, 50, 140, { x0: 0, y0: 100, x1: 100, y1: 160 }, {
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 100,
    })
    expect(hit?.zone).toBe('body')
  })

  it('counts an exact same-step tie as a body hit', () => {
    const shared = { x0: 0, y0: 0, x1: 100, y1: 100 }
    const hit = resolveDirectHit(50, 50, 80, 50, shared, shared)
    expect(hit?.zone).toBe('body')
    expect(hit?.t).toBe(0)
  })

  it('classifies splash inside the radius and a miss outside it', () => {
    const body = { x0: 1000, y0: 0, x1: 1400, y1: 600 }
    expect(groundZone(900, 0, body, 500)).toBe('splash')
    expect(groundZone(2000, 0, body, 500)).toBe('miss')
  })

  it('sends a vertical shot to the ground far from the cat', () => {
    const shot = dogThrow(90_000)
    expect(shot.zone).toBe('miss')
  })

  it('can hit the cat body, head, and splash radius in still air', () => {
    const found = new Map<Zone, number>()
    const counts = new Map<Zone, number>()
    for (let tenth = 0; tenth <= 900; tenth += 1) {
      const angle = tenth * 100
      const shot = dogThrow(angle)
      counts.set(shot.zone, (counts.get(shot.zone) ?? 0) + 1)
      if (!found.has(shot.zone)) found.set(shot.zone, angle)
    }
    expect(found.get('body'), `zones ${[...found.keys()].join(',')}`).toEqual(expect.any(Number))
    expect(found.get('head'), `zones ${[...found.keys()].join(',')}`).toEqual(expect.any(Number))
    expect(found.get('splash'), `zones ${[...found.keys()].join(',')}`).toEqual(expect.any(Number))
    expect(found.get('miss')).toEqual(expect.any(Number))
    expect(counts.get('body') ?? 0).toBeGreaterThan(counts.get('head') ?? 0)
  })

  it('moves the impact when the wind changes', () => {
    const angle = 20_000
    const calm = dogThrow(angle, 0)
    const cross = dogThrow(angle, 2000)
    expect(calm.contactX).not.toBe(cross.contactX)
  })
})
