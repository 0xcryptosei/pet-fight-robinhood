import type { MatchState } from '@pet-fight/game-engine'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { buildApp, type GameApp } from '../src/app'
import { aim } from './aim'

type SocketMessage = {
  type: string
  room?: { id: string; status: string; winner: string | null; outcome: string | null }
  match?: MatchState | null
  yourTurn?: boolean
  code?: string
}

async function login(app: GameApp, account: PrivateKeyAccount) {
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
  return verified.json() as { token: string; address: string }
}

function collect(socket: WebSocket): SocketMessage[] {
  const messages: SocketMessage[] = []
  socket.on('message', (raw) => {
    messages.push(JSON.parse(raw.toString()) as SocketMessage)
  })
  return messages
}

async function waitFor(messages: SocketMessage[], predicate: (message: SocketMessage) => boolean) {
  const started = Date.now()
  while (Date.now() - started < 3000) {
    const found = messages.find(predicate)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  throw new Error(`no socket message matched; saw ${messages.map((message) => message.type).join(',')}`)
}

describe('websocket battle', () => {
  it('lets two signed-in players finish a match and replay the same winner', async () => {
    const app = await buildApp({ tickMs: 0, serverSeed: 'server-seed-v1' })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const host = privateKeyToAccount(generatePrivateKey())
    const guest = privateKeyToAccount(generatePrivateKey())
    const hostSession = await login(app, host)
    const guestSession = await login(app, guest)
    const auth = (token: string) => ({ authorization: `Bearer ${token}` })

    const created = await app.inject({
      method: 'POST',
      url: '/rooms',
      headers: auth(hostSession.token),
      payload: { stakeTier: 20, visibility: 'public' },
    })
    expect(created.statusCode).toBe(201)
    const room = created.json() as { id: string }
    const funded = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/fund`,
      headers: auth(hostSession.token),
    })
    expect(funded.statusCode).toBe(200)
    const joined = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/join`,
      headers: auth(guestSession.token),
      payload: {},
    })
    expect(joined.statusCode).toBe(200)

    const hostSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${hostSession.token}`)
    const guestSocket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${guestSession.token}`)
    await Promise.all([
      new Promise<void>((resolve) => hostSocket.once('open', () => resolve())),
      new Promise<void>((resolve) => guestSocket.once('open', () => resolve())),
    ])
    const hostMessages = collect(hostSocket)
    const guestMessages = collect(guestSocket)
    hostSocket.send(JSON.stringify({ type: 'battle:sync', roomId: room.id }))
    guestSocket.send(JSON.stringify({ type: 'battle:sync', roomId: room.id }))

    await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/ready`,
      headers: auth(hostSession.token),
      payload: { clientSeed: 'host-seed' },
    })
    await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/ready`,
      headers: auth(guestSession.token),
      payload: { clientSeed: 'guest-seed' },
    })
    hostSocket.send(JSON.stringify({ type: 'battle:sync', roomId: room.id }))
    guestSocket.send(JSON.stringify({ type: 'battle:sync', roomId: room.id }))

    let winner: string | null = null
    for (let step = 0; step < 80 && !winner; step += 1) {
      await waitFor(
        hostMessages,
        (message) => message.room?.status === 'IN_PROGRESS' || message.room?.status === 'SETTLED',
      )
      const hostState = [...hostMessages].reverse().find((message) => message.room)
      if (!hostState?.room) throw new Error('missing room state')
      if (hostState.room.status === 'SETTLED') {
        winner = hostState.room.winner
        break
      }
      const match = hostState.match
      if (!match) throw new Error('missing match state')
      if (hostState.yourTurn) {
        const before = hostMessages.length
        hostSocket.send(
          JSON.stringify({
            type: 'battle:action',
            roomId: room.id,
            actionId: `host-${step}`,
            action: { type: 'normal', power: 1000, angle: aim(match, 0, 'body') },
          }),
        )
        await waitFor(hostMessages, (message) => hostMessages.indexOf(message) >= before && message.type === 'battle:state')
      } else {
        const before = guestMessages.length
        guestSocket.send(
          JSON.stringify({
            type: 'battle:action',
            roomId: room.id,
            actionId: `guest-${step}`,
            action: { type: 'pass' },
          }),
        )
        await waitFor(guestMessages, (message) => guestMessages.indexOf(message) >= before && message.type === 'battle:state')
      }
      const settled = hostMessages.find((message) => message.room?.status === 'SETTLED')
      if (settled?.room) winner = settled.room.winner
    }

    expect(winner).toBe(hostSession.address)
    const result = hostMessages.find((message) => message.type === 'battle:result')
    expect(result?.room?.outcome ?? hostMessages.some((message) => message.type === 'battle:result')).toBeTruthy()

    const replay = await app.inject({
      method: 'GET',
      url: `/rooms/${room.id}/replay`,
      headers: auth(hostSession.token),
    })
    expect(replay.statusCode).toBe(200)
    const body = replay.json() as { outcome: string; replay: string }
    expect(body.outcome).toBe('p1')
    expect(body.replay).toBe('p1')

    const duplicate = await waitFor(hostMessages, (message) => message.type === 'battle:state' && message.match !== null)
    const repeatId = 'host-repeat'
    hostSocket.send(
      JSON.stringify({
        type: 'battle:action',
        roomId: room.id,
        actionId: repeatId,
        action: { type: 'pass', damage: 999, winner: guest.address },
      }),
    )
    const rejected = await waitFor(hostMessages, (message) => message.type === 'error')
    expect(rejected.code).toBe('match-over')
    expect(duplicate.match).toBeTruthy()

    hostSocket.close()
    guestSocket.close()
    await app.close()
  })
})
