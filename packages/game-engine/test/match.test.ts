import { describe, expect, it } from 'vitest'
import {
  EngineError,
  RULES_HASH_V1,
  RULES_V1,
  applyAction,
  commitServerSeed,
  createMatch,
  playMatch,
  publicView,
  roundEntropy,
  simulateThrow,
  transcriptHash,
  type Action,
  type MatchSetup,
  type MatchState,
  type PlayerIndex,
  type SubmittedAction,
  type Zone,
} from '../src/index'

const setup: MatchSetup = {
  serverSeed: 'server-seed-v1',
  clientSeed1: 'client-a',
  clientSeed2: 'client-b',
}

function passUntilDone(state: MatchState): MatchState {
  let guard = 0
  while (state.status === 'playing' && guard < 500) {
    state = applyAction(state, {
      player: state.active,
      action: { type: 'pass' },
      actionId: `pass-${guard}`,
    })
    guard += 1
  }
  return state
}

function aim(state: MatchState, player: PlayerIndex, zone: Zone): number {
  const self = state.fighters[player]
  const foe = state.fighters[(1 - player) as PlayerIndex]
  const seen = new Set<Zone>()
  for (let tenth = 0; tenth <= 900; tenth += 1) {
    const angle = tenth * 100
    const shot = simulateThrow({
      originX: self.x + self.facing * RULES_V1.muzzleOffsetX,
      originY: RULES_V1.muzzleY,
      facing: self.facing,
      power: 1000,
      angle,
      wind: state.wind,
      defenderX: foe.x,
      defenderHead: RULES_V1.species[foe.species].head,
      defenderBody: RULES_V1.species[foe.species].body,
    })
    seen.add(shot.zone)
    if (shot.zone === zone) return angle
  }
  throw new Error(`No ${zone} angle at wind ${state.wind}; saw ${[...seen].join(',')}`)
}

describe('match flow', () => {
  it('publishes a sha256 commitment and hides the seed until the match ends', () => {
    expect(commitServerSeed('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const state = createMatch(setup)
    expect(state.serverSeedCommit).toBe(commitServerSeed(setup.serverSeed))
    expect(state.rulesHash).toBe(RULES_HASH_V1)
    expect(RULES_HASH_V1).toMatch(/^[0-9a-f]{64}$/)
    expect(publicView(state).serverSeed).toBeNull()
    expect(state.fighters[0].health).toBe(100)
    expect(state.fighters[1].health).toBe(80)
    expect(state.wind).toBeGreaterThanOrEqual(RULES_V1.windMin)
    expect(state.wind).toBeLessThanOrEqual(RULES_V1.windMax)
    expect(roundEntropy(setup, 1, 1)).not.toBe(roundEntropy(setup, 1, 2))
  })

  it('mixes client seeds into the wind', () => {
    const left = createMatch(setup)
    const right = createMatch({ ...setup, clientSeed2: 'client-other' })
    expect(left.wind).not.toBe(right.wind)
    expect(createMatch(setup).wind).toBe(left.wind)
  })

  it('rejects illegal actions without spending the turn', () => {
    const state = createMatch(setup)
    expect(() =>
      applyAction(state, { player: 1, action: { type: 'pass' } }),
    ).toThrow(EngineError)
    try {
      applyAction(state, { player: 1, action: { type: 'pass' } })
    } catch (error) {
      expect((error as EngineError).code).toBe('wrong-turn')
    }
    expect(() =>
      applyAction(state, {
        player: 0,
        action: { type: 'normal', power: 0, angle: 0 },
      }),
    ).toThrow(EngineError)
    expect(() =>
      applyAction(state, {
        player: 0,
        action: { type: 'ability' } as unknown as Action,
      }),
    ).toThrow(EngineError)
    expect(state.active).toBe(0)
    expect(state.events).toHaveLength(1)
    expect(state.fighters[0].energy).toBe(100)
  })

  it('spends energy, caps heals, and treats a repeated action id as a no-op', () => {
    let state = createMatch(setup)
    state = applyAction(state, { player: 0, action: { type: 'heal' }, actionId: 'heal-1' })
    expect(state.fighters[0].health).toBe(100)
    expect(state.fighters[0].energy).toBe(60)
    expect(state.active).toBe(1)
    const retried = applyAction(state, {
      player: 1,
      action: { type: 'power', power: 1000, angle: 10_000 },
      actionId: 'heal-1',
    })
    expect(retried).toBe(state)

    state = applyAction(state, { player: 1, action: { type: 'pass' } })
    state = applyAction(state, { player: 0, action: { type: 'heal' } })
    expect(state.fighters[0].energy).toBe(20)
    state = applyAction(state, { player: 1, action: { type: 'pass' } })
    try {
      applyAction(state, { player: 0, action: { type: 'heal' } })
      throw new Error('expected heal cap')
    } catch (error) {
      expect((error as EngineError).code).toBe('heal-cap')
    }
    expect(state.active).toBe(0)
    expect(state.fighters[0].energy).toBe(20)
  })

  it('rejects a power shot once energy is below its cost', () => {
    let state = createMatch(setup)
    const shot: Action = { type: 'power', power: 1000, angle: 45_000 }
    state = applyAction(state, { player: 0, action: shot })
    expect(state.fighters[0].energy).toBe(65)
    state = applyAction(state, { player: 1, action: { type: 'pass' } })
    state = applyAction(state, { player: 0, action: shot })
    expect(state.fighters[0].energy).toBe(30)
    state = applyAction(state, { player: 1, action: { type: 'pass' } })
    try {
      applyAction(state, { player: 0, action: shot })
      throw new Error('expected energy rejection')
    } catch (error) {
      expect((error as EngineError).code).toBe('insufficient-energy')
    }
    expect(state.fighters[0].energy).toBe(30)
    expect(state.active).toBe(0)
  })

  it('draws a match of passes: equal health percentages, one replay, then a void', () => {
    const done = passUntilDone(createMatch(setup))
    expect(done.status).toBe('complete')
    expect(done.outcome).toBe('draw')
    expect(done.p1Rounds).toBe(0)
    expect(done.p2Rounds).toBe(0)
    const actions = done.events.filter((event) => event.kind === 'action')
    expect(actions).toHaveLength(400)
    const firstAttempt = actions.filter(
      (event) => event.kind === 'action' && event.roundSlot === 1 && event.attempt === 1,
    )
    expect(firstAttempt.filter((event) => event.kind === 'action' && event.player === 0)).toHaveLength(20)
    expect(firstAttempt.filter((event) => event.kind === 'action' && event.player === 1)).toHaveLength(20)
    const endings = done.events.filter((event) => event.kind === 'round-end')
    expect(endings.filter((event) => event.kind === 'round-end' && event.result === 'draw')).toHaveLength(5)
    expect(endings.filter((event) => event.kind === 'round-end' && event.result === 'void')).toHaveLength(5)
    const starts = done.events.filter((event) => event.kind === 'round-start')
    const slot2 = starts.find((event) => event.kind === 'round-start' && event.roundSlot === 2 && event.attempt === 1)
    expect(slot2 && slot2.kind === 'round-start' ? slot2.active : null).toBe(1)
    expect(publicView(done).serverSeed).toBe(setup.serverSeed)
  })

  it('replays a full transcript to the same events and hash', () => {
    const submitted: SubmittedAction[] = []
    let state = createMatch(setup)
    while (state.status === 'playing' && submitted.length < 500) {
      const action: SubmittedAction = {
        player: state.active,
        action: { type: 'pass' as const },
        actionId: `replay-${submitted.length}`,
      }
      submitted.push(action)
      state = applyAction(state, action)
    }
    const again = playMatch(setup, submitted)
    expect(again.events).toEqual(state.events)
    expect(again.outcome).toBe(state.outcome)
    expect(transcriptHash(again)).toBe(transcriptHash(state))
  })

  it('lets the dog win a best of three by aiming body shots', () => {
    const submitted: SubmittedAction[] = []
    let state = createMatch(setup)
    let safety = 0
    let checkedReset = false
    while (state.status === 'playing' && safety < 200) {
      const action: Action =
        state.active === 0
          ? { type: 'normal', power: 1000, angle: aim(state, 0, 'body') }
          : { type: 'pass' }
      const submittedAction: {
        player: PlayerIndex
        action: Action
        actionId: string
      } = {
        player: state.active,
        action,
        actionId: `win-${submitted.length}`,
      }
      submitted.push(submittedAction)
      state = applyAction(state, submittedAction)
      safety += 1
      const latest = state.events[state.events.length - 1]
      if (
        !checkedReset &&
        state.p1Rounds === 1 &&
        state.roundSlot === 2 &&
        latest?.kind === 'round-start'
      ) {
        expect(state.fighters[0].health).toBe(100)
        expect(state.fighters[1].health).toBe(80)
        expect(state.fighters[0].energy).toBe(100)
        checkedReset = true
      }
    }
    expect(state.status).toBe('complete')
    expect(state.outcome).toBe('p1')
    expect(state.p1Rounds).toBe(2)
    expect(state.p2Rounds).toBe(0)
    expect(state.roundSlot).toBeLessThanOrEqual(2)
    const again = playMatch(setup, submitted)
    expect(again.events).toEqual(state.events)
    expect(transcriptHash(again)).toBe(transcriptHash(state))

    const hits = state.events.filter((event) => event.kind === 'action').flatMap((event) =>
      event.kind === 'action' ? event.hits : [],
    )
    expect(hits.some((hit) => hit.zone === 'body' && hit.damage > 0)).toBe(true)
    expect(hits.every((hit) => hit.damage <= 32)).toBe(true)
  })

  it('resolves both hits of a double attack on a fresh defender', () => {
    const state = createMatch(setup)
    const angle = aim(state, 0, 'body')
    const next = applyAction(state, {
      player: 0,
      action: { type: 'double', power: 1000, angle },
    })
    const action = next.events.find((event) => event.kind === 'action')
    expect(action && action.kind === 'action' ? action.hits : []).toHaveLength(2)
    expect(next.fighters[0].energy).toBe(75)
    const hitZones = action && action.kind === 'action' ? action.hits.map((hit) => hit.zone) : []
    expect(hitZones[0]).toBe('body')
    expect(hitZones[1]).toBe('body')
  })
})
