import { computeDamage, type Zone } from './damage'
import { canonicalJson, sha256Hex } from './hash'
import { simulateThrow } from './physics'
import { mulberry32, uint32FromHex } from './prng'
import {
  RULES_HASH_V1,
  RULES_V1,
  type SpeciesId,
  type ThrowKind,
} from './rules/v1'

export type PlayerIndex = 0 | 1

export type Action =
  | { type: ThrowKind; power: number; angle: number }
  | { type: 'heal' }
  | { type: 'pass' }

export type SubmittedAction = {
  player: PlayerIndex
  action: Action
  actionId?: string
}

export type ShotHit = {
  zone: Zone
  contactX: number
  contactY: number
  multiplier: number
  damage: number
  rawDamage: number
  capped: boolean
  target: PlayerIndex
  healthAfter: number
}

export type MatchEvent =
  | {
      kind: 'round-start'
      roundSlot: number
      attempt: number
      wind: number
      active: PlayerIndex
    }
  | {
      kind: 'action'
      roundSlot: number
      attempt: number
      turn: number
      player: PlayerIndex
      action: Action
      hits: ShotHit[]
      healthAfter: [number, number]
      energyAfter: [number, number]
    }
  | {
      kind: 'round-end'
      roundSlot: number
      attempt: number
      result: 'p1' | 'p2' | 'draw' | 'void'
      p1Health: number
      p2Health: number
      p1Rounds: number
      p2Rounds: number
    }
  | {
      kind: 'match-end'
      outcome: 'p1' | 'p2' | 'draw'
      p1Rounds: number
      p2Rounds: number
    }

export type Fighter = {
  species: SpeciesId
  level: 1
  maxHealth: number
  power: number
  intelligence: number
  health: number
  energy: number
  healsUsed: number
  turnsTaken: number
  x: number
  facing: 1 | -1
}

export type MatchOutcome = 'ongoing' | 'p1' | 'p2' | 'draw'

export type MatchState = {
  rulesVersion: 1
  rulesHash: string
  serverSeed: string
  serverSeedCommit: string
  clientSeed1: string
  clientSeed2: string
  fighters: [Fighter, Fighter]
  roundSlot: number
  attempt: number
  active: PlayerIndex
  wind: number
  p1Rounds: number
  p2Rounds: number
  status: 'playing' | 'complete'
  outcome: MatchOutcome
  events: MatchEvent[]
  actions: Action[]
  actionIds: string[]
}

export type MatchSetup = {
  serverSeed: string
  clientSeed1: string
  clientSeed2: string
}

export type EngineErrorCode =
  | 'match-over'
  | 'wrong-turn'
  | 'insufficient-energy'
  | 'invalid-power'
  | 'invalid-angle'
  | 'heal-cap'
  | 'unknown-action'
  | 'bad-seed'

export class EngineError extends Error {
  readonly code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

export type PublicMatch = Omit<MatchState, 'serverSeed'> & {
  serverSeed: string | null
}

const THROW_TYPES = new Set<ThrowKind>(['normal', 'power', 'sniping', 'double'])

export function commitServerSeed(serverSeed: string): string {
  return sha256Hex(serverSeed)
}

export function roundEntropy(
  setup: Pick<MatchSetup, 'serverSeed' | 'clientSeed1' | 'clientSeed2'>,
  roundSlot: number,
  attempt: number,
): string {
  return sha256Hex(
    [setup.serverSeed, setup.clientSeed1, setup.clientSeed2, String(roundSlot), String(attempt)].join(
      '\n',
    ),
  )
}

export function windFromEntropy(entropyHex: string): number {
  const rng = mulberry32(uint32FromHex(entropyHex))
  const span = RULES_V1.windMax - RULES_V1.windMin + 1
  return RULES_V1.windMin + (rng() % span)
}

export function createMatch(setup: MatchSetup): MatchState {
  if (!setup.serverSeed || !setup.clientSeed1 || !setup.clientSeed2) {
    throw new EngineError('bad-seed', 'Server and both client seeds are required')
  }
  const state: MatchState = {
    rulesVersion: 1,
    rulesHash: RULES_HASH_V1,
    serverSeed: setup.serverSeed,
    serverSeedCommit: commitServerSeed(setup.serverSeed),
    clientSeed1: setup.clientSeed1,
    clientSeed2: setup.clientSeed2,
    fighters: [makeFighter('dog'), makeFighter('cat')],
    roundSlot: 1,
    attempt: 1,
    active: 0,
    wind: 0,
    p1Rounds: 0,
    p2Rounds: 0,
    status: 'playing',
    outcome: 'ongoing',
    events: [],
    actions: [],
    actionIds: [],
  }
  beginAttempt(state)
  return state
}

export function applyAction(state: MatchState, submitted: SubmittedAction): MatchState {
  if (submitted.actionId !== undefined && state.actionIds.includes(submitted.actionId)) {
    return state
  }
  if (state.status !== 'playing') {
    throw new EngineError('match-over', 'The match is already complete')
  }
  if (submitted.player !== state.active) {
    throw new EngineError('wrong-turn', 'It is the other player’s turn')
  }
  validateAction(state, submitted.action)

  const next = structuredClone(state)
  if (submitted.actionId !== undefined) next.actionIds.push(submitted.actionId)
  next.actions.push(cloneAction(submitted.action))
  resolveAction(next, submitted.action)
  return next
}

export function playMatch(setup: MatchSetup, submitted: SubmittedAction[]): MatchState {
  return submitted.reduce((state, action) => applyAction(state, action), createMatch(setup))
}

export function publicView(state: MatchState): PublicMatch {
  return {
    ...structuredClone(state),
    serverSeed: state.status === 'complete' ? state.serverSeed : null,
  }
}

export function transcriptHash(state: MatchState): string {
  return sha256Hex(
    canonicalJson({
      rulesHash: state.rulesHash,
      serverSeed: state.serverSeed,
      clientSeed1: state.clientSeed1,
      clientSeed2: state.clientSeed2,
      events: state.events,
      outcome: state.outcome,
      p1Rounds: state.p1Rounds,
      p2Rounds: state.p2Rounds,
    }),
  )
}

export function healthPercentWinner(p1: Fighter, p2: Fighter): 'p1' | 'p2' | 'draw' {
  const left = p1.health * p2.maxHealth
  const right = p2.health * p1.maxHealth
  if (left > right) return 'p1'
  if (right > left) return 'p2'
  return 'draw'
}

/** Both fighters at 0 health on one resolution step is a round draw. */
export function knockoutResult(p1Health: number, p2Health: number): 'p1' | 'p2' | 'draw' | null {
  if (p1Health <= 0 && p2Health <= 0) return 'draw'
  if (p2Health <= 0) return 'p1'
  if (p1Health <= 0) return 'p2'
  return null
}

function makeFighter(species: SpeciesId): Fighter {
  const spec = RULES_V1.species[species]
  return {
    species,
    level: 1,
    maxHealth: spec.health,
    power: spec.power,
    intelligence: spec.intelligence,
    health: spec.health,
    energy: RULES_V1.startingEnergy,
    healsUsed: 0,
    turnsTaken: 0,
    x: spec.x,
    facing: spec.facing,
  }
}

function beginAttempt(state: MatchState): void {
  state.wind = windFromEntropy(roundEntropy(state, state.roundSlot, state.attempt))
  state.active = starterFor(state.roundSlot)
  state.events.push({
    kind: 'round-start',
    roundSlot: state.roundSlot,
    attempt: state.attempt,
    wind: state.wind,
    active: state.active,
  })
}

function starterFor(roundSlot: number): PlayerIndex {
  return roundSlot % 2 === 1 ? 0 : 1
}

function validateAction(state: MatchState, action: Action): void {
  if (action.type === 'pass') return
  if (action.type === 'heal') {
    const self = state.fighters[state.active]
    if (self.healsUsed >= RULES_V1.maxHealsPerRound) {
      throw new EngineError('heal-cap', 'Heal cap for this round is already used')
    }
    if (self.energy < RULES_V1.energyCost.heal) {
      throw new EngineError('insufficient-energy', 'Not enough Intel Energy to heal')
    }
    return
  }
  if (!THROW_TYPES.has(action.type)) {
    throw new EngineError('unknown-action', 'Action type is not in rules version 1')
  }
  if (
    !Number.isInteger(action.power) ||
    action.power < RULES_V1.minPower ||
    action.power > RULES_V1.maxPower
  ) {
    throw new EngineError('invalid-power', 'Power must be an integer from 1 to 1000')
  }
  if (
    !Number.isInteger(action.angle) ||
    action.angle < RULES_V1.minAngle ||
    action.angle > RULES_V1.maxAngle
  ) {
    throw new EngineError('invalid-angle', 'Angle must be an integer from 0 to 90000 millidegrees')
  }
  const cost = RULES_V1.energyCost[action.type]
  if (state.fighters[state.active].energy < cost) {
    throw new EngineError('insufficient-energy', 'Not enough Intel Energy for that shot')
  }
}

function resolveAction(state: MatchState, action: Action): void {
  const player = state.active
  const self = state.fighters[player]
  const foeIndex = (1 - player) as PlayerIndex
  const foe = state.fighters[foeIndex]
  const hits: ShotHit[] = []

  if (action.type === 'heal') {
    self.healsUsed += 1
    self.energy -= RULES_V1.energyCost.heal
    self.health = Math.min(self.maxHealth, self.health + RULES_V1.healAmount)
  } else if (action.type !== 'pass') {
    self.energy -= RULES_V1.energyCost[action.type]
    const shotCount = action.type === 'double' ? 2 : 1
    for (let shot = 0; shot < shotCount; shot += 1) {
      if (foe.health <= 0) break
      const flight = simulateThrow({
        originX: self.x + self.facing * RULES_V1.muzzleOffsetX,
        originY: RULES_V1.muzzleY,
        facing: self.facing,
        power: action.power,
        angle: action.angle,
        wind: state.wind,
        defenderX: foe.x,
        defenderHead: RULES_V1.species[foe.species].head,
        defenderBody: RULES_V1.species[foe.species].body,
      })
      const dealt = computeDamage({
        action: action.type,
        power: action.power,
        attackerPower: self.power,
        defenderMaxHealth: foe.maxHealth,
        zone: flight.zone,
      })
      foe.health = Math.max(0, foe.health - dealt.damage)
      hits.push({
        zone: flight.zone,
        contactX: flight.contactX,
        contactY: flight.contactY,
        multiplier: dealt.zoneMultiplier,
        damage: dealt.damage,
        rawDamage: dealt.rawDamage,
        capped: dealt.capped,
        target: foeIndex,
        healthAfter: foe.health,
      })
      if (knockoutResult(state.fighters[0].health, state.fighters[1].health) !== null) {
        break
      }
    }
  }

  self.turnsTaken += 1
  state.events.push({
    kind: 'action',
    roundSlot: state.roundSlot,
    attempt: state.attempt,
    turn: self.turnsTaken,
    player,
    action: cloneAction(action),
    hits,
    healthAfter: [state.fighters[0].health, state.fighters[1].health],
    energyAfter: [state.fighters[0].energy, state.fighters[1].energy],
  })

  const ko = knockoutResult(state.fighters[0].health, state.fighters[1].health)
  if (ko) {
    endRound(state, ko)
    return
  }

  const upcoming = (1 - player) as PlayerIndex
  if (state.fighters[upcoming].turnsTaken >= RULES_V1.turnLimitPerPlayer) {
    endRound(state, healthPercentWinner(state.fighters[0], state.fighters[1]))
    return
  }
  state.active = upcoming
}

function endRound(state: MatchState, result: 'p1' | 'p2' | 'draw'): void {
  if (result === 'p1') state.p1Rounds += 1
  if (result === 'p2') state.p2Rounds += 1

  const voided = result === 'draw' && state.attempt === 2
  state.events.push({
    kind: 'round-end',
    roundSlot: state.roundSlot,
    attempt: state.attempt,
    result: voided ? 'void' : result,
    p1Health: state.fighters[0].health,
    p2Health: state.fighters[1].health,
    p1Rounds: state.p1Rounds,
    p2Rounds: state.p2Rounds,
  })

  if (state.p1Rounds >= 2 || state.p2Rounds >= 2) {
    finish(state, state.p1Rounds >= 2 ? 'p1' : 'p2')
    return
  }

  if (result === 'draw' && state.attempt === 1) {
    state.attempt = 2
    resetFighters(state)
    beginAttempt(state)
    return
  }

  advanceSlot(state)
}

function advanceSlot(state: MatchState): void {
  if (state.roundSlot >= RULES_V1.maxRounds) {
    finish(state, 'draw')
    return
  }
  state.roundSlot += 1
  state.attempt = 1
  resetFighters(state)
  beginAttempt(state)
}

function finish(state: MatchState, outcome: 'p1' | 'p2' | 'draw'): void {
  state.status = 'complete'
  state.outcome = outcome
  state.events.push({
    kind: 'match-end',
    outcome,
    p1Rounds: state.p1Rounds,
    p2Rounds: state.p2Rounds,
  })
}

function resetFighters(state: MatchState): void {
  for (const fighter of state.fighters) {
    fighter.health = fighter.maxHealth
    fighter.energy = RULES_V1.startingEnergy
    fighter.healsUsed = 0
    fighter.turnsTaken = 0
  }
}

function cloneAction(action: Action): Action {
  if (action.type === 'heal' || action.type === 'pass') return { type: action.type }
  return { type: action.type, power: action.power, angle: action.angle }
}
