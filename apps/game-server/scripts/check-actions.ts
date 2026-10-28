import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'
import WebSocket from 'ws'
import { aim } from '../test/aim'

const base = 'http://127.0.0.1:4000'
const results: { action: string; ok: boolean; detail: string }[] = []

function record(action: string, ok: boolean, detail: string) {
  results.push({ action, ok, detail })
}

async function call(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json: unknown = text
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: response.status, json }
}

async function login(account: PrivateKeyAccount) {
  const nonce = await call('POST', '/auth/nonce', { address: account.address })
  const message = (nonce.json as { message: string }).message
  const signature = await account.signMessage({ message })
  const verified = await call('POST', '/auth/verify', { address: account.address, signature })
  return { nonce: nonce.status, verify: verified.status, token: (verified.json as { token: string }).token }
}

function socketCall(token: string, payload: unknown): Promise<{ type?: string; code?: string; room?: { status: string; winner: string | null }; match?: { active: 0 | 1; wind: number; fighters: { x: number; facing: 1 | -1; species: 'dog' | 'cat' }[] } }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:4000/ws?token=${token}`)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('timeout'))
    }, 5000)
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('open', () => socket.send(JSON.stringify(payload)))
    socket.on('message', (raw) => {
      clearTimeout(timer)
      socket.close()
      resolve(JSON.parse(String(raw)))
    })
  })
}

async function main() {
  const health = await call('GET', '/health')
  record('GET /health', health.status === 200, String(health.status))
  const chain = await call('GET', '/chain')
  record('GET /chain', chain.status === 200 && (chain.json as { chainId: number }).chainId === 46630, String(chain.status))
  const empty = await call('GET', '/chain/rooms/0')
  record('GET /chain/rooms/0', empty.status === 200 && (empty.json as { status: string }).status === 'NONE', String(empty.status))
  const badRoom = await call('GET', '/chain/rooms/nope')
  record('GET /chain/rooms/nope', badRoom.status === 400, String(badRoom.status))
  const ops = await call('GET', '/ops/status')
  record('GET /ops/status', ops.status === 200 && (ops.json as { realValue: boolean }).realValue === false, String(ops.status))
  const quote = await call('POST', '/rooms/quote', { stakeTier: 20 })
  record('POST /rooms/quote', quote.status === 200, String(quote.status))
  const badQuote = await call('POST', '/rooms/quote', { stakeTier: 15 })
  record('POST /rooms/quote bad tier', badQuote.status === 400, String(badQuote.status))
  const list = await call('GET', '/rooms')
  record('GET /rooms', list.status === 200, String(list.status))
  const badList = await call('GET', '/rooms?visibility=private')
  record('GET /rooms bad visibility', badList.status === 400, String(badList.status))
  const noBalance = await call('GET', '/me/balances')
  record('GET /me/balances no session', noBalance.status === 401, String(noBalance.status))

  const host = privateKeyToAccount(generatePrivateKey())
  const guest = privateKeyToAccount(generatePrivateKey())
  const hostSession = await login(host)
  const guestSession = await login(guest)
  record('POST /auth/nonce + /auth/verify', hostSession.verify === 200 && guestSession.verify === 200, `${hostSession.verify}/${guestSession.verify}`)
  const balances = await call('GET', '/me/balances', undefined, hostSession.token)
  record('GET /me/balances', balances.status === 200, String(balances.status))

  const created = await call('POST', '/rooms', { stakeTier: 20, visibility: 'public' }, hostSession.token)
  const roomId = (created.json as { id: string }).id
  record('POST /rooms', created.status === 201, String(created.status))
  const fetched = await call('GET', `/rooms/${roomId}`)
  record('GET /rooms/:id', fetched.status === 200, String(fetched.status))
  const funded = await call('POST', `/rooms/${roomId}/fund`, {}, hostSession.token)
  record('POST /rooms/:id/fund', funded.status === 200, String(funded.status))
  const selfJoin = await call('POST', `/rooms/${roomId}/join`, {}, hostSession.token)
  record('POST /rooms/:id/join self', selfJoin.status === 400, String(selfJoin.status))
  const joined = await call('POST', `/rooms/${roomId}/join`, {}, guestSession.token)
  record('POST /rooms/:id/join', joined.status === 200, String(joined.status))

  const other = await call('POST', '/rooms', { stakeTier: 10, visibility: 'public' }, hostSession.token)
  const otherId = (other.json as { id: string }).id
  await call('POST', `/rooms/${otherId}/fund`, {}, hostSession.token)
  const cancelled = await call('POST', `/rooms/${otherId}/cancel`, {}, hostSession.token)
  record('POST /rooms/:id/cancel', cancelled.status === 200 && (cancelled.json as { status: string }).status === 'CANCELLED', String(cancelled.status))

  const hostReady = await call('POST', `/rooms/${roomId}/ready`, { clientSeed: 'host-seed' }, hostSession.token)
  const guestReady = await call('POST', `/rooms/${roomId}/ready`, { clientSeed: 'guest-seed' }, guestSession.token)
  record('POST /rooms/:id/ready', hostReady.status === 200 && guestReady.status === 200, `${hostReady.status}/${guestReady.status}`)

  const badSocket = await socketCall(hostSession.token, { type: 'battle:action' })
  record('WS missing room', badSocket.code === 'bad-message', badSocket.code ?? 'none')
  let state = await socketCall(hostSession.token, { type: 'battle:sync', roomId })
  record('WS battle:sync', state.type === 'battle:state', state.type ?? 'none')
  let guard = 0
  while (state.room?.status === 'IN_PROGRESS' && state.match && guard < 120) {
    const active = state.match.active
    const token = active === 0 ? hostSession.token : guestSession.token
    const action = active === 0 ? { type: 'normal', power: 1000, angle: aim(state.match, 0, 'body') } : { type: 'pass' }
    state = await socketCall(token, { type: 'battle:action', roomId, actionId: `a-${guard}`, action })
    guard += 1
  }
  record('WS battle:action until settled', state.room?.status === 'SETTLED' || state.type === 'battle:result', state.room?.status ?? state.type ?? 'none')
  const replay = await call('GET', `/rooms/${roomId}/replay`, undefined, hostSession.token)
  record('GET /rooms/:id/replay', replay.status === 200, String(replay.status))
  const stranger = privateKeyToAccount(generatePrivateKey())
  const strangerSession = await login(stranger)
  const hidden = await call('GET', `/rooms/${roomId}/replay`, undefined, strangerSession.token)
  record('GET /rooms/:id/replay stranger', hidden.status === 400, String(hidden.status))

  const unauthChain = await call('POST', '/chain/rooms/0/session', {})
  record('POST /chain/rooms/:id/session no session', unauthChain.status === 401, String(unauthChain.status))
  const chainSession = await call('POST', '/chain/rooms/0/session', {}, hostSession.token)
  record('POST /chain/rooms/0/session', chainSession.status === 409, `${chainSession.status}`)

  const failed = results.filter((item) => !item.ok)
  console.log(JSON.stringify({ checked: results.length, failed: failed.length, results }, null, 2))
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
