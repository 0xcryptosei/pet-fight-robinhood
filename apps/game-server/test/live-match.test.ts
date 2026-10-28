import { describe, expect, it } from 'vitest'
import { FAUCET_AMOUNT, PHASE2, stakeAmount } from '../src/config'
import { Ledger } from '../src/ledger'
import { RoomBook } from '../src/rooms'

function started() {
  let time = 1_700_000_000_000
  const ledger = new Ledger()
  const book = new RoomBook(ledger, () => time)
  const host = '0x1111111111111111111111111111111111111111'
  const guest = '0x2222222222222222222222222222222222222222'
  ledger.ensure(host)
  ledger.ensure(guest)
  const room = book.create(host, 20, 'public')
  book.fund(room.id, host)
  book.join(room.id, guest)
  book.ready(room.id, host, 'host-seed')
  book.ready(room.id, guest, 'guest-seed')
  return {
    book,
    ledger,
    host,
    guest,
    roomId: room.id,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('reconnect and forfeit', () => {
  it('pauses the turn timer once, then lets the remaining time run out', () => {
    const { book, host, guest, roomId, advance } = started()
    book.disconnect(roomId, host)
    expect(book.get(roomId, host).turn?.paused).toBe(true)
    advance(10_000)
    book.tick()
    expect(book.get(roomId, host).status).toBe('IN_PROGRESS')
    expect(book.get(roomId, host).turn?.active).toBe(host)

    book.reconnect(roomId, host)
    const resumed = book.get(roomId, host).turn
    expect(resumed?.paused).toBe(false)
    expect(resumed?.active).toBe(host)

    book.disconnect(roomId, host)
    expect(book.get(roomId, host).turn?.paused).toBe(false)

    advance(PHASE2.reconnectGraceMs)
    book.tick()
    expect(book.get(roomId, host).turn?.active).toBe(guest)
    book.act(roomId, guest, { type: 'pass' }, 'guest-pass')
    expect(book.get(roomId, host).turn?.active).toBe(host)
  })

  it('forfeits to the opponent after three timeout passes and replays that winner', () => {
    const { book, ledger, host, guest, roomId, advance } = started()
    book.disconnect(roomId, host)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      advance(PHASE2.reconnectGraceMs)
      book.tick()
      if (book.get(roomId, host).status === 'SETTLED') break
      book.act(roomId, guest, { type: 'pass' }, `guest-${attempt}`)
    }
    const done = book.get(roomId, host)
    expect(done.status).toBe('SETTLED')
    expect(done.outcome).toBe('p2')
    expect(done.winner).toBe(guest)
    expect(ledger.balances(guest).available).toBe(FAUCET_AMOUNT + stakeAmount(20))
    expect(ledger.balances(host).available).toBe(FAUCET_AMOUNT - stakeAmount(20))
    const replay = book.replay(roomId)
    expect(replay.replay).toBe('p2')
    expect(replay.transcript.forfeit?.reason).toBe('timeouts')
  })
})
