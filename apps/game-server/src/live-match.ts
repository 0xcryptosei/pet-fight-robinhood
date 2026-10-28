import {
  EngineError,
  RULES_V1,
  applyAction,
  createMatch,
  publicView,
  transcriptHash,
  type Action,
  type MatchSetup,
  type MatchState,
  type PlayerIndex,
  type PublicMatch,
  type SubmittedAction,
} from '@pet-fight/game-engine'
import { PHASE2 } from './config'
import { RoomError } from './errors'
import { type ForfeitRecord, type ServerOutcome, type ServerTranscript } from './replay'

export type TurnClock = {
  active: PlayerIndex
  paused: boolean
  deadlineAt: number | null
  graceUntil: number | null
  timeoutStreak: [number, number]
}

/**
 * Turn timer is 15 seconds and runs only while the active player is connected.
 * The first disconnect of a turn pauses that timer and grants 30 seconds of grace.
 * A second disconnect in the same turn does not pause again.
 * When grace or the turn timer expires, the server submits a pass.
 * Three consecutive timeout passes by one player forfeit the match to the opponent.
 * An explicit action, including an explicit pass, clears that player's timeout streak.
 */
export class LiveMatch {
  private match: MatchState
  private readonly submitted: SubmittedAction[] = []
  private readonly connected: [boolean, boolean] = [true, true]
  private turnStartedAt = 0
  private remainingMs: number = RULES_V1.turnTimeoutMs
  private paused = false
  private graceUsed = false
  private graceUntil: number | null = null
  private readonly streak: [number, number] = [0, 0]
  private forfeit: ForfeitRecord | undefined
  private engineDone = false

  constructor(
    private readonly setup: MatchSetup,
    now: number,
  ) {
    this.match = createMatch(setup)
    this.beginTurn(now)
  }

  get state(): MatchState {
    return this.match
  }

  view(): PublicMatch {
    const revealed = publicView(this.match)
    if (this.forfeit) return { ...revealed, serverSeed: this.match.serverSeed }
    return revealed
  }

  clock(): TurnClock {
    return {
      active: this.match.active,
      paused: this.paused,
      deadlineAt: this.paused ? null : this.turnStartedAt + this.remainingMs,
      graceUntil: this.paused ? this.graceUntil : null,
      timeoutStreak: [this.streak[0], this.streak[1]],
    }
  }

  transcript(): ServerTranscript {
    return {
      setup: this.setup,
      actions: this.submitted.map((entry) => ({
        player: entry.player,
        action: entry.action,
        ...(entry.actionId ? { actionId: entry.actionId } : {}),
      })),
      ...(this.forfeit ? { forfeit: this.forfeit } : {}),
    }
  }

  outcome(): ServerOutcome | null {
    if (this.forfeit) return this.forfeit.winner
    if (this.engineDone) {
      return this.match.outcome === 'ongoing' ? null : this.match.outcome
    }
    return null
  }

  hash(): string | null {
    if (!this.engineDone || this.forfeit) return null
    return transcriptHash(this.match)
  }

  disconnect(player: PlayerIndex, now: number): void {
    this.connected[player] = false
    if (this.finished() || this.match.active !== player || this.paused) return
    if (this.graceUsed) return
    const elapsed = now - this.turnStartedAt
    this.remainingMs = Math.max(0, this.remainingMs - elapsed)
    this.graceUsed = true
    this.paused = true
    this.graceUntil = now + PHASE2.reconnectGraceMs
  }

  reconnect(player: PlayerIndex, now: number): void {
    this.connected[player] = true
    if (this.finished() || !this.paused || this.match.active !== player) return
    this.paused = false
    this.graceUntil = null
    this.turnStartedAt = now
  }

  act(player: PlayerIndex, action: Action, actionId: string, now: number): PublicMatch {
    if (this.finished()) throw new RoomError('match-over', 'The match is already complete')
    const before = this.match
    try {
      this.match = applyAction(this.match, { player, action, actionId })
    } catch (error) {
      if (error instanceof EngineError) {
        throw new RoomError(error.code, error.message)
      }
      throw error
    }
    if (this.match === before) return this.view()
    this.submitted.push({ player, action, actionId })
    this.streak[player] = 0
    this.afterAction(now)
    return this.view()
  }

  tick(now: number): void {
    if (this.finished()) return
    if (this.paused) {
      if (this.graceUntil !== null && now >= this.graceUntil) this.timeout(now)
      return
    }
    if (now >= this.turnStartedAt + this.remainingMs) this.timeout(now)
  }

  private timeout(now: number): void {
    const player = this.match.active
    const actionId = `timeout:${this.match.roundSlot}:${this.match.attempt}:${player}:${this.match.fighters[player].turnsTaken}`
    const before = this.match
    this.match = applyAction(this.match, { player, action: { type: 'pass' }, actionId })
    if (this.match === before) return
    this.submitted.push({ player, action: { type: 'pass' }, actionId })
    this.streak[player] += 1
    if (this.match.status === 'complete') {
      this.engineDone = true
      return
    }
    if (this.streak[player] >= PHASE2.forfeitTimeouts) {
      const winner = player === 0 ? 'p2' : 'p1'
      this.forfeit = { player, winner, reason: 'timeouts' }
      return
    }
    this.beginTurn(now)
  }

  private afterAction(now: number): void {
    if (this.match.status === 'complete') {
      this.engineDone = true
      return
    }
    this.beginTurn(now)
  }

  private beginTurn(now: number): void {
    this.turnStartedAt = now
    this.remainingMs = RULES_V1.turnTimeoutMs
    this.paused = false
    this.graceUsed = false
    this.graceUntil = null
    const active = this.match.active
    if (!this.connected[active]) {
      this.graceUsed = true
      this.paused = true
      this.graceUntil = now + PHASE2.reconnectGraceMs
    }
  }

  private finished(): boolean {
    return this.engineDone || this.forfeit !== undefined
  }
}
