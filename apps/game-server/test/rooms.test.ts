import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { FAUCET_AMOUNT, stakeAmount } from '../src/config'
import { RoomError } from '../src/errors'
import { Ledger } from '../src/ledger'
import { RoomBook } from '../src/rooms'
import { aim } from './aim'

const stake = stakeAmount(20)

function clock(start = 1_700_000_000_000) {
  let time = start
  return {
    now: () => time,
    set: (next: number) => {
      time = next
    },
    advance: (ms: number) => {
      time += ms
    },
  }
}

function bookWith(timer = clock(), serverSeed?: string) {
  const ledger = new Ledger()
  const book = new RoomBook(ledger, timer.now, serverSeed)
  const host = '0x1111111111111111111111111111111111111111'
  const guest = '0x2222222222222222222222222222222222222222'
  ledger.ensure(host)
  ledger.ensure(guest)
  return { book, ledger, timer, host, guest }
}

describe('test-credit rooms', () => {
  it('rejects an unknown tier and keeps locked credits out of the available balance', () => {
    const { book, ledger, host } = bookWith()
    expect(() => book.quote(15)).toThrow(RoomError)
    const room = book.create(host, 20, 'public')
    book.fund(room.id, host)
    const balances = ledger.balances(host)
    expect(balances.available).toBe(FAUCET_AMOUNT - stake)
    expect(balances.locked).toBe(stake)
    expect(balances.available + balances.locked).toBe(FAUCET_AMOUNT)
  })

  it('rejects a self-join and a second guest', () => {
    const { book, host, guest } = bookWith()
    const other = '0x3333333333333333333333333333333333333333'
    book.ledger.ensure(other)
    const room = book.create(host, 20, 'public')
    book.fund(room.id, host.toUpperCase())
    expect(() => book.join(room.id, host)).toThrow(RoomError)
    try {
      book.join(room.id, host)
    } catch (error) {
      expect((error as RoomError).code).toBe('self-join')
    }
    book.join(room.id, guest)
    expect(() => book.join(room.id, other)).toThrow(RoomError)
    try {
      book.join(room.id, other)
    } catch (error) {
      expect((error as RoomError).code).toBe('duplicate-join')
    }
    expect(book.ledger.balances(guest).locked).toBe(stake)
    expect(book.ledger.balances(other).locked).toBe(0n)
  })

  it('cancels a funded room before an opponent arrives and refunds the host', () => {
    const { book, ledger, host } = bookWith()
    const room = book.create(host, 50, 'public')
    book.fund(room.id, host)
    const cancelled = book.cancel(room.id, host)
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.hostDeposit).toBe(false)
    expect(ledger.balances(host).available).toBe(FAUCET_AMOUNT)
    expect(ledger.balances(host).locked).toBe(0n)
  })

  it('refunds the host when nobody joins before the join deadline', () => {
    const { book, ledger, timer, host } = bookWith()
    const room = book.create(host, 20, 'public')
    book.fund(room.id, host)
    timer.set(room.joinDeadline + 1)
    book.tick()
    expect(book.get(room.id, host).status).toBe('EXPIRED')
    expect(ledger.balances(host).available).toBe(FAUCET_AMOUNT)
    expect(ledger.balances(host).locked).toBe(0n)
  })

  it('refunds both players if the match is never started before the start deadline', () => {
    const { book, ledger, timer, host, guest } = bookWith()
    const room = book.create(host, 20, 'private')
    expect(book.listPublic()).toHaveLength(0)
    book.fund(room.id, host)
    const invite = book.get(room.id, host).inviteCode
    book.join(room.id, guest, invite)
    const ready = book.get(room.id, host)
    expect(ready.startDeadline).not.toBeNull()
    timer.set((ready.startDeadline ?? 0) + 1)
    book.tick()
    expect(book.get(room.id, host).status).toBe('EXPIRED')
    expect(ledger.balances(host).locked).toBe(0n)
    expect(ledger.balances(guest).locked).toBe(0n)
    expect(ledger.balances(host).available).toBe(FAUCET_AMOUNT)
    expect(ledger.balances(guest).available).toBe(FAUCET_AMOUNT)
  })

  it('pays the winner the full pot and replays to the same winner', () => {
    const { book, ledger, host, guest } = bookWith(clock(), 'server-seed-v1')
    const room = book.create(host, 20, 'public')
    book.fund(room.id, host)
    book.join(room.id, guest)
    book.ready(room.id, host, 'host-seed')
    book.ready(room.id, guest, 'guest-seed')
    const opening = book.matchView(room.id)
    if (!opening) throw new Error('missing match')
    book.act(room.id, host, { type: 'normal', power: 1000, angle: aim(opening, 0, 'body') }, 'once')
    const damaged = book.matchView(room.id)
    book.act(room.id, host, { type: 'normal', power: 1000, angle: 1, damage: 999 } as never, 'once')
    expect(book.matchView(room.id)?.fighters[1].health).toBe(damaged?.fighters[1].health)
    let guard = 0
    while (book.get(room.id, host).status === 'IN_PROGRESS' && guard < 120) {
      const view = book.matchView(room.id)
      if (!view) throw new Error('missing match')
      const active = view.active
      if (active === 0) {
        book.act(room.id, host, { type: 'normal', power: 1000, angle: aim(view, 0, 'body') }, `h-${guard}`)
      } else {
        book.act(room.id, guest, { type: 'pass' }, `g-${guard}`)
      }
      guard += 1
    }
    const done = book.get(room.id, host)
    expect(done.status).toBe('SETTLED')
    expect(done.outcome).toBe('p1')
    expect(done.winner).toBe(host)
    expect(done.payout).toBe((stake * 2n).toString())
    expect(ledger.balances(host).available).toBe(FAUCET_AMOUNT + stake)
    expect(ledger.balances(guest).available).toBe(FAUCET_AMOUNT - stake)
    expect(ledger.balances(host).locked).toBe(0n)
    expect(ledger.balances(guest).locked).toBe(0n)
    const replay = book.replay(room.id)
    expect(replay.replay).toBe(replay.outcome)
    expect(replay.replay).toBe('p1')
  })

  it('signs in with a nonce and rejects an address that was not signed', async () => {
    let time = 1_700_000_000_000
    const app = await buildApp({ now: () => time })
    const account = privateKeyToAccount(generatePrivateKey())
    const nonce = await app.inject({
      method: 'POST',
      url: '/auth/nonce',
      payload: { address: account.address },
    })
    const issued = nonce.json() as { message: string }
    const signature = await account.signMessage({ message: issued.message })
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: account.address, signature },
    })
    expect(verified.statusCode).toBe(200)
    const session = verified.json() as { token: string; address: string }
    expect(session.address).toBe(account.address.toLowerCase())
    const balances = await app.inject({
      method: 'GET',
      url: '/me/balances',
      headers: { authorization: `Bearer ${session.token}` },
    })
    const body = balances.json() as { available: string; lockedInRooms: string; pendingSettlement: string }
    expect(body.available).toBe(FAUCET_AMOUNT.toString())
    expect(body.lockedInRooms).toBe('0')
    expect(body.pendingSettlement).toBe('0')
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: account.address, signature: '0x' + 'ab'.repeat(65) },
    })
    expect(wrong.statusCode).toBe(401)
    await app.close()
  })
})
