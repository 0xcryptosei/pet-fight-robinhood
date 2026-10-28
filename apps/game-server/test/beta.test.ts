import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { buildApp } from '../src/app'
import { PHASE6 } from '../src/config'
import { RoomError } from '../src/errors'
import { Ledger } from '../src/ledger'
import { RoomBook } from '../src/rooms'
import { aim } from './aim'

function bookWith(maxOpenRooms: number, betaPaused = false) {
  const ledger = new Ledger()
  const book = new RoomBook(ledger, () => Date.now(), 'server-seed-v1', maxOpenRooms, betaPaused)
  const host = '0x1111111111111111111111111111111111111111'
  const guest = '0x2222222222222222222222222222222222222222'
  ledger.ensure(host)
  ledger.ensure(guest)
  return { book, host, guest }
}

function play(book: RoomBook, host: string, guest: string): void {
  const room = book.create(host, 20, 'public')
  book.fund(room.id, host)
  book.join(room.id, guest)
  book.ready(room.id, host, 'host-seed')
  book.ready(room.id, guest, 'guest-seed')
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
}

describe('phase 6 beta', () => {
  it('caps open rooms and frees a slot when the host cancels', () => {
    const { book, host } = bookWith(2)
    const first = book.create(host, 20, 'public')
    book.create(host, 20, 'public')
    expect(() => book.create(host, 20, 'public')).toThrow(RoomError)
    try {
      book.create(host, 20, 'public')
    } catch (error) {
      expect((error as RoomError).code).toBe('beta-cap')
    }
    book.cancel(first.id, host)
    expect(book.create(host, 20, 'public').status).toBe('CREATED')
  })

  it('refuses new rooms while the beta is paused', () => {
    const { book, host } = bookWith(10, true)
    expect(() => book.create(host, 20, 'public')).toThrow(RoomError)
    book.setBetaPaused(false)
    expect(book.create(host, 20, 'public').status).toBe('CREATED')
  })

  it('creates thirty rooms inside the cap', () => {
    const { book, host } = bookWith(40)
    const started = Date.now()
    for (let index = 0; index < 30; index += 1) book.create(host, 10, 'public')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(book.betaSnapshot().openRooms).toBe(30)
  })

  it('logs a repeated pair and does not block the next room', () => {
    const { book, host, guest } = bookWith(10)
    play(book, host, guest)
    expect(book.betaSnapshot().repeatedPairs).toEqual([])
    play(book, host, guest)
    expect(book.betaSnapshot().repeatedPairs).toEqual([{ players: [host, guest], matches: 2 }])
    expect(book.create(host, 20, 'public').status).toBe('CREATED')
  })

  it('reports real-value play off and hides invite codes', async () => {
    const app = await buildApp({ tickMs: 0, maxOpenRooms: 5 })
    const account = privateKeyToAccount(generatePrivateKey())
    const nonce = await app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: account.address } })
    const issued = nonce.json() as { message: string }
    const signature = await account.signMessage({ message: issued.message })
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: account.address, signature },
    })
    const token = (verified.json() as { token: string }).token
    const created = await app.inject({
      method: 'POST',
      url: '/rooms',
      headers: { authorization: `Bearer ${token}` },
      payload: { stakeTier: 20, visibility: 'private' },
    })
    const inviteCode = (created.json() as { inviteCode?: string }).inviteCode ?? ''
    expect(inviteCode.length).toBeGreaterThan(0)
    const status = await app.inject({ method: 'GET', url: '/ops/status' })
    expect(status.statusCode).toBe(200)
    const body = status.json() as { realValue: boolean; chainId: number; rooms: { openRooms: number } }
    expect(body.realValue).toBe(false)
    expect(body.chainId).toBe(PHASE6.chainId)
    expect(body.rooms.openRooms).toBe(1)
    expect(JSON.stringify(status.json())).not.toContain(inviteCode)
    await app.close()
  })

  it('closes a socket past the session cap', async () => {
    const app = await buildApp({ tickMs: 0, maxSessions: 1 })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const account = privateKeyToAccount(generatePrivateKey())
    const nonce = await app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: account.address } })
    const issued = nonce.json() as { message: string }
    const signature = await account.signMessage({ message: issued.message })
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: account.address, signature },
    })
    const token = (verified.json() as { token: string }).token
    const first = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`)
    await new Promise<void>((resolve, reject) => {
      first.once('open', () => resolve())
      first.once('error', reject)
    })
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`)
    const code = await new Promise<number>((resolve) => {
      second.once('close', (closed) => resolve(closed))
    })
    expect(code).toBe(4008)
    first.close()
    await app.close()
  })
})
