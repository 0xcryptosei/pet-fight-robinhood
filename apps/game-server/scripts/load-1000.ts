/**
 * Local 1,000-player load test. In-memory test credits only.
 * Does not deploy or call a contract.
 */
import { performance } from 'node:perf_hooks'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'
import WebSocket from 'ws'
import { buildApp } from '../src/app'
import { PHASE6 } from '../src/config'

const PLAYERS = PHASE6.maxSessions
const ROOMS = PHASE6.maxOpenRooms

type Session = { account: PrivateKeyAccount; token: string; loginMs: number }

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[index])
}

async function pool(count: number, limit: number, worker: (index: number) => Promise<void>): Promise<void> {
  let next = 0
  async function run(): Promise<void> {
    while (next < count) {
      const current = next
      next += 1
      await worker(current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, () => run()))
}

async function main(): Promise<void> {
  const failures: string[] = []
  const app = await buildApp({ tickMs: 0 })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const bound = app.server.address()
  const port = typeof bound === 'object' && bound ? bound.port : 0
  const base = `http://127.0.0.1:${port}`
  const started = performance.now()

  const accounts = Array.from({ length: PLAYERS }, () => privateKeyToAccount(generatePrivateKey()))
  const sessions: Session[] = new Array(PLAYERS)

  await pool(PLAYERS, 40, async (index) => {
    const account = accounts[index]
    const began = performance.now()
    try {
      const nonce = await fetch(`${base}/auth/nonce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: account.address }),
      })
      if (!nonce.ok) throw new Error(`nonce ${nonce.status}`)
      const issued = (await nonce.json()) as { message: string }
      const signature = await account.signMessage({ message: issued.message })
      const verified = await fetch(`${base}/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: account.address, signature }),
      })
      if (!verified.ok) throw new Error(`verify ${verified.status} ${await verified.text()}`)
      const body = (await verified.json()) as { token: string }
      sessions[index] = { account, token: body.token, loginMs: performance.now() - began }
    } catch (error) {
      failures.push(`login ${index}: ${error instanceof Error ? error.message : 'failed'}`)
    }
  })

  const roomIds: string[] = new Array(ROOMS)
  const roomMs: number[] = []
  await pool(ROOMS, 40, async (index) => {
    const host = sessions[index]
    const guest = sessions[index + ROOMS]
    if (!host || !guest) {
      failures.push(`room ${index}: missing session`)
      return
    }
    const began = performance.now()
    try {
      const created = await fetch(`${base}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${host.token}` },
        body: JSON.stringify({ stakeTier: 10, visibility: 'public' }),
      })
      if (!created.ok) throw new Error(`create ${created.status} ${await created.text()}`)
      const room = (await created.json()) as { id: string }
      const funded = await fetch(`${base}/rooms/${room.id}/fund`, {
        method: 'POST',
        headers: { authorization: `Bearer ${host.token}` },
      })
      if (!funded.ok) throw new Error(`fund ${funded.status} ${await funded.text()}`)
      const joined = await fetch(`${base}/rooms/${room.id}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${guest.token}` },
        body: '{}',
      })
      if (!joined.ok) throw new Error(`join ${joined.status} ${await joined.text()}`)
      roomIds[index] = room.id
      roomMs.push(performance.now() - began)
    } catch (error) {
      failures.push(`room ${index}: ${error instanceof Error ? error.message : 'failed'}`)
    }
  })

  const sockets: WebSocket[] = []
  const syncMs: number[] = []
  await pool(PLAYERS, 50, async (index) => {
    const session = sessions[index]
    const roomId = roomIds[index < ROOMS ? index : index - ROOMS]
    if (!session || !roomId) {
      failures.push(`socket ${index}: missing room`)
      return
    }
    const began = performance.now()
    try {
      const socket = await openSocket(port, session.token, roomId)
      sockets.push(socket)
      syncMs.push(performance.now() - began)
    } catch (error) {
      failures.push(`socket ${index}: ${error instanceof Error ? error.message : 'failed'}`)
    }
  })

  const status = await fetch(`${base}/ops/status`)
  const body = (await status.json()) as {
    realValue: boolean
    connectedSockets: number
    rooms: { openRooms: number; inProgress: number }
    caps: { maxSessions: number; maxOpenRooms: number }
  }
  const elapsedMs = Math.round(performance.now() - started)
  const loginMs = sessions.filter(Boolean).map((session) => session.loginMs)
  const report = {
    players: PLAYERS,
    rooms: ROOMS,
    contracts: false,
    realValue: body.realValue,
    logins: loginMs.length,
    seatedRooms: roomMs.length,
    sockets: sockets.length,
    connectedSockets: body.connectedSockets,
    openRooms: body.rooms.openRooms,
    failures: failures.length,
    elapsedMs,
    loginP50Ms: percentile(loginMs, 50),
    loginP95Ms: percentile(loginMs, 95),
    roomP50Ms: percentile(roomMs, 50),
    roomP95Ms: percentile(roomMs, 95),
    syncP50Ms: percentile(syncMs, 50),
    syncP95Ms: percentile(syncMs, 95),
    failureSample: failures.slice(0, 5),
  }
  console.log(JSON.stringify(report, null, 2))

  for (const socket of sockets) socket.close()
  await app.close()

  const passed =
    failures.length === 0 &&
    body.realValue === false &&
    body.connectedSockets === PLAYERS &&
    body.rooms.openRooms === ROOMS &&
    loginMs.length === PLAYERS &&
    roomMs.length === ROOMS &&
    sockets.length === PLAYERS
  if (!passed) process.exitCode = 1
}

function openSocket(port: number, token: string, roomId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('sync timed out'))
    }, 15_000)
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.once('close', (code) => {
      clearTimeout(timer)
      reject(new Error(`closed ${code}`))
    })
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'battle:sync', roomId }))
    })
    socket.once('message', () => {
      clearTimeout(timer)
      socket.removeAllListeners('close')
      resolve(socket)
    })
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
