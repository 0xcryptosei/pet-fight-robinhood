import { randomBytes, randomUUID } from 'node:crypto'
import { RULES_HASH_V1, type Action } from '@pet-fight/game-engine'
import { PHASE2, PHASE6, isStakeTier, stakeAmount, type StakeTier } from './config'
import { RoomError } from './errors'
import { normalizeAddress } from './auth'
import { Ledger } from './ledger'
import { LiveMatch } from './live-match'
import { replayOutcome, type ServerOutcome, type ServerTranscript } from './replay'

export type RoomStatus =
  | 'CREATED'
  | 'HOST_FUNDED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'SETTLED'
  | 'CANCELLED'
  | 'EXPIRED'

export type RoomRecord = {
  id: string
  visibility: 'public' | 'private'
  inviteCode: string
  host: string
  guest: string | null
  stakeTier: StakeTier
  stakeAmount: bigint
  feeBps: 0
  custody: 'credits' | 'chain'
  status: RoomStatus
  rulesVersion: 1
  rulesHash: string
  createdAt: number
  joinDeadline: number
  startDeadline: number | null
  settleDeadline: number | null
  hostReady: string | null
  guestReady: string | null
  live: LiveMatch | null
  transcript: ServerTranscript | null
  outcome: ServerOutcome | null
  winner: string | null
}

export type RoomView = {
  id: string
  visibility: 'public' | 'private'
  host: string
  guest: string | null
  stakeTier: StakeTier
  stakeAmount: string
  feeBps: 0
  custody: 'credits' | 'chain'
  pot: string
  payout: string
  status: RoomStatus
  rulesVersion: 1
  rulesHash: string
  joinDeadline: number
  startDeadline: number | null
  settleDeadline: number | null
  hostDeposit: boolean
  guestDeposit: boolean
  inviteCode?: string
  outcome: ServerOutcome | null
  winner: string | null
  turn: {
    active: string
    paused: boolean
    deadlineAt: number | null
    graceUntil: number | null
  } | null
}

const OPEN_ROOM: ReadonlySet<RoomStatus> = new Set(['CREATED', 'HOST_FUNDED', 'READY', 'IN_PROGRESS'])

export type BetaSnapshot = {
  openRooms: number
  inProgress: number
  settled: number
  repeatedPairs: { players: [string, string]; matches: number }[]
}

export class RoomBook {
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly pairCounts = new Map<string, number>()
  private betaPaused: boolean

  constructor(
    readonly ledger: Ledger,
    private readonly now: () => number,
    private readonly serverSeed?: string,
    private readonly maxOpenRooms: number = PHASE6.maxOpenRooms,
    betaPaused = false,
  ) {
    this.betaPaused = betaPaused
  }

  setBetaPaused(paused: boolean): void {
    this.betaPaused = paused
  }

  quote(tier: number): { stakeTier: StakeTier; stakeAmount: string; feeBps: 0; pot: string; payout: string } {
    if (!isStakeTier(tier)) throw new RoomError('bad-tier', 'Stake tier must be 10, 20, 50, 100, or 1000')
    const amount = stakeAmount(tier)
    const pot = amount * 2n
    return {
      stakeTier: tier,
      stakeAmount: amount.toString(),
      feeBps: 0,
      pot: pot.toString(),
      payout: pot.toString(),
    }
  }

  create(rawHost: string, stakeTier: number, visibility: 'public' | 'private'): RoomView {
    if (this.betaPaused) throw new RoomError('beta-paused', 'New rooms are paused', 503)
    if (this.openRoomCount() >= this.maxOpenRooms) {
      throw new RoomError('beta-cap', `The beta is capped at ${this.maxOpenRooms} open rooms`, 429)
    }
    const host = normalizeAddress(rawHost)
    const quote = this.quote(stakeTier)
    const createdAt = this.now()
    const room: RoomRecord = {
      id: randomUUID(),
      visibility,
      inviteCode: randomBytes(4).toString('hex'),
      host,
      guest: null,
      stakeTier: quote.stakeTier,
      stakeAmount: BigInt(quote.stakeAmount),
      feeBps: 0,
      custody: 'credits',
      status: 'CREATED',
      rulesVersion: 1,
      rulesHash: RULES_HASH_V1,
      createdAt,
      joinDeadline: createdAt + PHASE2.joinWindowMs,
      startDeadline: null,
      settleDeadline: null,
      hostReady: null,
      guestReady: null,
      live: null,
      transcript: null,
      outcome: null,
      winner: null,
    }
    this.rooms.set(room.id, room)
    return this.view(room, host)
  }

  /** A battle session for an escrow room that already holds both deposits. Does not move test credits. */
  openFromChain(rawViewer: string, chain: { roomId: string; host: string; guest: string; stakeTier: number }): RoomView {
    const viewer = normalizeAddress(rawViewer)
    const host = normalizeAddress(chain.host)
    const guest = normalizeAddress(chain.guest)
    if (viewer !== host && viewer !== guest) throw new RoomError('not-player', 'Only the host or guest can open this match')
    const existing = this.rooms.get(chain.roomId)
    if (existing && existing.status !== 'EXPIRED' && existing.status !== 'CANCELLED') return this.view(existing, viewer)
    if (this.betaPaused) throw new RoomError('beta-paused', 'New rooms are paused', 503)
    if (!existing && this.openRoomCount() >= this.maxOpenRooms) {
      throw new RoomError('beta-cap', `The beta is capped at ${this.maxOpenRooms} open rooms`, 429)
    }
    const quote = this.quote(chain.stakeTier)
    const createdAt = this.now()
    const room: RoomRecord = {
      id: chain.roomId,
      visibility: 'public',
      inviteCode: randomBytes(4).toString('hex'),
      host,
      guest,
      stakeTier: quote.stakeTier,
      stakeAmount: BigInt(quote.stakeAmount),
      feeBps: 0,
      custody: 'chain',
      status: 'READY',
      rulesVersion: 1,
      rulesHash: RULES_HASH_V1,
      createdAt,
      joinDeadline: createdAt + PHASE2.joinWindowMs,
      startDeadline: createdAt + PHASE2.startWindowMs,
      settleDeadline: null,
      hostReady: null,
      guestReady: null,
      live: null,
      transcript: null,
      outcome: null,
      winner: null,
    }
    this.rooms.set(room.id, room)
    return this.view(room, viewer)
  }

  fund(roomId: string, rawHost: string): RoomView {
    const host = normalizeAddress(rawHost)
    const room = this.require(roomId)
    this.assertHost(room, host)
    if (room.status !== 'CREATED') throw new RoomError('wrong-state', 'The host deposit is already recorded')
    if (this.now() > room.joinDeadline) throw new RoomError('expired', 'The room join window has ended')
    this.ledger.lock(host, room.stakeAmount)
    room.status = 'HOST_FUNDED'
    return this.view(room, host)
  }

  join(roomId: string, rawGuest: string, inviteCode?: string): RoomView {
    const guest = normalizeAddress(rawGuest)
    const room = this.require(roomId)
    if (guest === room.host) throw new RoomError('self-join', 'The host cannot join their own room')
    if (room.guest) throw new RoomError('duplicate-join', 'This room already has an opponent')
    if (room.status !== 'HOST_FUNDED') throw new RoomError('wrong-state', 'The room is not waiting for an opponent')
    if (this.now() > room.joinDeadline) throw new RoomError('expired', 'The room join window has ended')
    if (room.visibility === 'private' && inviteCode !== room.inviteCode) {
      throw new RoomError('bad-invite', 'Private room invite code does not match')
    }
    this.ledger.lock(guest, room.stakeAmount)
    room.guest = guest
    room.status = 'READY'
    room.startDeadline = this.now() + PHASE2.startWindowMs
    return this.view(room, guest)
  }

  cancel(roomId: string, rawHost: string): RoomView {
    const host = normalizeAddress(rawHost)
    const room = this.require(roomId)
    this.assertHost(room, host)
    if (room.status !== 'CREATED' && room.status !== 'HOST_FUNDED') {
      throw new RoomError('wrong-state', 'The host can cancel only before an opponent locks credits')
    }
    if (room.status === 'HOST_FUNDED') this.ledger.refund(room.host, room.stakeAmount)
    room.status = 'CANCELLED'
    return this.view(room, host)
  }

  ready(roomId: string, rawAddress: string, clientSeed: string): RoomView {
    const address = normalizeAddress(rawAddress)
    const room = this.require(roomId)
    if (!clientSeed) throw new RoomError('bad-seed', 'A client seed is required')
    if (room.status !== 'READY' || !room.guest) {
      throw new RoomError('wrong-state', 'Both deposits must be locked before ready')
    }
    if (address === room.host) room.hostReady = clientSeed
    else if (address === room.guest) room.guestReady = clientSeed
    else throw new RoomError('not-player', 'Only the host or guest can ready')
    if (room.hostReady && room.guestReady) this.start(room)
    return this.view(room, address)
  }

  act(roomId: string, rawAddress: string, action: Action, actionId: string): RoomView {
    const address = normalizeAddress(rawAddress)
    const room = this.requirePlaying(roomId)
    const player = this.playerIndex(room, address)
    room.live!.act(player, action, actionId, this.now())
    this.settleIfDone(room)
    return this.view(room, address)
  }

  disconnect(roomId: string, rawAddress: string): void {
    const address = normalizeAddress(rawAddress)
    const room = this.rooms.get(roomId)
    if (!room?.live || room.status !== 'IN_PROGRESS') return
    const player = this.playerIndex(room, address)
    room.live.disconnect(player, this.now())
  }

  reconnect(roomId: string, rawAddress: string): RoomView {
    const address = normalizeAddress(rawAddress)
    const room = this.require(roomId)
    this.playerIndex(room, address)
    if (room.status === 'IN_PROGRESS' && room.live) {
      room.live.reconnect(this.playerIndex(room, address), this.now())
    }
    return this.view(room, address)
  }

  tick(): void {
    const now = this.now()
    for (const room of this.rooms.values()) {
      if (room.status === 'HOST_FUNDED' && now > room.joinDeadline) {
        this.returnStake(room, room.host)
        room.status = 'EXPIRED'
      } else if (room.status === 'READY' && room.startDeadline !== null && now > room.startDeadline && room.guest) {
        this.returnStake(room, room.host)
        this.returnStake(room, room.guest)
        room.status = 'EXPIRED'
      } else if (room.status === 'CREATED' && now > room.joinDeadline) {
        room.status = 'EXPIRED'
      } else if (
        room.status === 'IN_PROGRESS' &&
        room.settleDeadline !== null &&
        now > room.settleDeadline &&
        room.live &&
        room.live.outcome() === null
      ) {
        this.refundBoth(room)
        room.status = 'EXPIRED'
        room.outcome = null
      } else if (room.status === 'IN_PROGRESS' && room.live) {
        room.live.tick(now)
        this.settleIfDone(room)
      }
    }
  }

  listPublic(): RoomView[] {
    return [...this.rooms.values()]
      .filter((room) => room.visibility === 'public' && room.status === 'HOST_FUNDED')
      .map((room) => this.view(room, null))
  }

  get(roomId: string, viewer: string | null): RoomView {
    return this.view(this.require(roomId), viewer)
  }

  matchView(roomId: string) {
    const room = this.require(roomId)
    return room.live?.view() ?? null
  }

  replay(roomId: string): { outcome: ServerOutcome; transcript: ServerTranscript; replay: ServerOutcome } {
    const room = this.require(roomId)
    if (!room.transcript || !room.outcome) {
      throw new RoomError('wrong-state', 'This room has no finished transcript')
    }
    return {
      outcome: room.outcome,
      transcript: room.transcript,
      replay: replayOutcome(room.transcript),
    }
  }

  private start(room: RoomRecord): void {
    if (!room.guest || !room.hostReady || !room.guestReady) return
    const now = this.now()
    room.live = new LiveMatch(
      {
        serverSeed: this.serverSeed ?? randomBytes(32).toString('hex'),
        clientSeed1: room.hostReady,
        clientSeed2: room.guestReady,
      },
      now,
    )
    room.status = 'IN_PROGRESS'
    room.settleDeadline = now + PHASE2.settleWindowMs
  }

  private settleIfDone(room: RoomRecord): void {
    if (room.status !== 'IN_PROGRESS' || !room.live || !room.guest) return
    const outcome = room.live.outcome()
    if (!outcome) return
    room.transcript = room.live.transcript()
    room.outcome = outcome
    if (outcome === 'draw') {
      this.refundBoth(room)
      room.winner = null
    } else {
      const winner = outcome === 'p1' ? room.host : room.guest
      const loser = outcome === 'p1' ? room.guest : room.host
      if (room.custody === 'credits') this.ledger.payPot(winner, loser, room.stakeAmount)
      room.winner = winner
    }
    room.status = 'SETTLED'
    this.notePair(room.host, room.guest)
  }

  betaSnapshot(): BetaSnapshot {
    let openRooms = 0
    let inProgress = 0
    let settled = 0
    for (const room of this.rooms.values()) {
      if (OPEN_ROOM.has(room.status)) openRooms += 1
      if (room.status === 'IN_PROGRESS') inProgress += 1
      if (room.status === 'SETTLED') settled += 1
    }
    const repeatedPairs = [...this.pairCounts.entries()]
      .filter(([, matches]) => matches >= 2)
      .map(([key, matches]) => {
        const [left, right] = key.split(':')
        return { players: [left, right] as [string, string], matches }
      })
    return { openRooms, inProgress, settled, repeatedPairs }
  }

  private openRoomCount(): number {
    let count = 0
    for (const room of this.rooms.values()) if (OPEN_ROOM.has(room.status)) count += 1
    return count
  }

  private notePair(host: string, guest: string): void {
    const key = host < guest ? `${host}:${guest}` : `${guest}:${host}`
    this.pairCounts.set(key, (this.pairCounts.get(key) ?? 0) + 1)
  }

  private refundBoth(room: RoomRecord): void {
    this.returnStake(room, room.host)
    if (room.guest) this.returnStake(room, room.guest)
  }

  private returnStake(room: RoomRecord, address: string): void {
    if (room.custody === 'chain') return
    this.ledger.refund(address, room.stakeAmount)
  }

  private playerIndex(room: RoomRecord, address: string): 0 | 1 {
    if (address === room.host) return 0
    if (address === room.guest) return 1
    throw new RoomError('not-player', 'Only the host or guest can play this room')
  }

  private requirePlaying(roomId: string): RoomRecord {
    const room = this.require(roomId)
    if (room.status === 'SETTLED') {
      throw new RoomError('match-over', 'The match is already complete')
    }
    if (room.status !== 'IN_PROGRESS' || !room.live) {
      throw new RoomError('wrong-state', 'The match has not started')
    }
    return room
  }

  private require(roomId: string): RoomRecord {
    const room = this.rooms.get(roomId)
    if (!room) throw new RoomError('not-found', 'Room not found', 404)
    return room
  }

  private assertHost(room: RoomRecord, host: string): void {
    if (room.host !== host) throw new RoomError('not-host', 'Only the host can do that')
  }

  private view(room: RoomRecord, viewer: string | null): RoomView {
    const clock = room.live && room.status === 'IN_PROGRESS' ? room.live.clock() : null
    const active = clock === null ? null : clock.active === 0 ? room.host : room.guest
    const normalizedViewer = viewer ? normalizeAddress(viewer) : null
    const showInvite = normalizedViewer === room.host || normalizedViewer === room.guest
    const hostDeposit =
      room.status === 'HOST_FUNDED' || room.status === 'READY' || room.status === 'IN_PROGRESS'
    const guestDeposit = room.status === 'READY' || room.status === 'IN_PROGRESS'
    return {
      id: room.id,
      visibility: room.visibility,
      host: room.host,
      guest: room.guest,
      stakeTier: room.stakeTier,
      stakeAmount: room.stakeAmount.toString(),
      feeBps: 0,
      custody: room.custody,
      pot: (room.stakeAmount * 2n).toString(),
      payout: (room.stakeAmount * 2n).toString(),
      status: room.status,
      rulesVersion: room.rulesVersion,
      rulesHash: room.rulesHash,
      joinDeadline: room.joinDeadline,
      startDeadline: room.startDeadline,
      settleDeadline: room.settleDeadline,
      hostDeposit,
      guestDeposit,
      ...(showInvite ? { inviteCode: room.inviteCode } : {}),
      outcome: room.outcome,
      winner: room.winner,
      turn:
        clock && active
          ? {
              active,
              paused: clock.paused,
              deadlineAt: clock.deadlineAt,
              graceUntil: clock.graceUntil,
            }
          : null,
    }
  }
}

export function parseAction(input: unknown): Action {
  if (!input || typeof input !== 'object') {
    throw new RoomError('unknown-action', 'Action must be an object')
  }
  const record = input as Record<string, unknown>
  if (record.type === 'pass' || record.type === 'heal') return { type: record.type }
  if (
    record.type === 'normal' ||
    record.type === 'power' ||
    record.type === 'sniping' ||
    record.type === 'double'
  ) {
    if (typeof record.power !== 'number' || typeof record.angle !== 'number') {
      throw new RoomError('unknown-action', 'Throw actions need numeric power and angle')
    }
    return { type: record.type, power: record.power, angle: record.angle }
  }
  throw new RoomError('unknown-action', 'Action type is not in rules version 1')
}
