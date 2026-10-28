import websocket from '@fastify/websocket'
import { type PublicMatch } from '@pet-fight/game-engine'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { createAuthStore } from './auth'
import { readChainRoom, requireConfirmedRoom } from './chain-room'
import { PHASE2, PHASE6 } from './config'
import { TESTNET } from './testnet'
import { RoomError } from './errors'
import { Ledger } from './ledger'
import { parseAction, RoomBook, type RoomView } from './rooms'

type AuthedRequest = FastifyRequest & { address?: string }

export type GameApp = Awaited<ReturnType<typeof buildApp>>

export async function buildApp(options?: {
  now?: () => number
  tickMs?: number
  serverSeed?: string
  maxOpenRooms?: number
  maxSessions?: number
  betaPaused?: boolean
}) {
  const now = options?.now ?? (() => Date.now())
  const maxSessions = options?.maxSessions ?? PHASE6.maxSessions
  const auth = createAuthStore()
  const maxOpenRooms = options?.maxOpenRooms ?? PHASE6.maxOpenRooms
  const book = new RoomBook(new Ledger(), now, options?.serverSeed, maxOpenRooms, options?.betaPaused ?? false)
  const sockets = new Map<string, Set<WebSocket>>()
  const socketAddress = new Map<WebSocket, string>()
  const watchers = new Map<string, Set<WebSocket>>()
  const resultSent = new Map<WebSocket, Set<string>>()

  const app = Fastify({ logger: false })
  await app.register(websocket)

  app.decorate('book', book)
  app.decorate('authStore', auth)
  app.decorate('clock', now)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RoomError) {
      return reply.status(error.status).send({ error: error.code, message: error.message })
    }
    return reply.status(500).send({ error: 'internal', message: 'Internal error' })
  })

  app.addHook('onRequest', async (request: AuthedRequest) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    const address = auth.session(header.slice('Bearer '.length), now())
    if (address) request.address = address
  })

  function requireUser(request: AuthedRequest): string {
    if (!request.address) throw new RoomError('unauthorized', 'Session is missing or expired', 401)
    return request.address
  }

  function send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload))
  }

  function push(socket: WebSocket, roomId: string): void {
    const address = socketAddress.get(socket)
    if (!address) return
    const room = book.get(roomId, address)
    const match = book.matchView(roomId)
    send(socket, {
      type: 'battle:state',
      room,
      match,
      yourTurn: room.turn?.active === address,
    })
    if (room.status === 'SETTLED' || room.status === 'EXPIRED') {
      const sent = resultSent.get(socket) ?? new Set<string>()
      if (sent.has(roomId)) return
      sent.add(roomId)
      resultSent.set(socket, sent)
      send(socket, resultPayload(room, match))
    }
  }

  function broadcast(roomId: string): void {
    for (const socket of watchers.get(roomId) ?? []) push(socket, roomId)
  }

  app.get('/health', async () => ({ ok: true, realValue: PHASE6.realValue, chainId: TESTNET.chainId }))

  app.get('/chain', async () => ({
    chainId: TESTNET.chainId,
    network: TESTNET.name,
    contracts: TESTNET,
    realValue: false,
  }))

  app.get('/chain/rooms/:roomId', async (request) => {
    const params = request.params as { roomId: string }
    return readChainRoom(parseRoomId(params.roomId))
  })

  app.post('/chain/rooms/:roomId/session', async (request: AuthedRequest, reply: FastifyReply) => {
    const params = request.params as { roomId: string }
    const viewer = requireUser(request)
    const chainRoom = requireConfirmedRoom(await readChainRoom(parseRoomId(params.roomId)))
    const room = book.openFromChain(viewer, chainRoom)
    return reply.status(201).send(room)
  })

  app.get('/ops/status', async () => ({
    ok: true,
    phase: 6,
    network: PHASE6.network,
    chainId: PHASE6.chainId,
    realValue: PHASE6.realValue,
    custody: 'in-memory-test-credits',
    contracts: TESTNET,
    feeBps: PHASE2.feeBps,
    petcRedeemable: false,
    caps: { maxOpenRooms, maxSessions },
    rooms: book.betaSnapshot(),
    connectedSockets: [...sockets.values()].reduce((sum, set) => sum + set.size, 0),
  }))

  app.post('/auth/nonce', async (request) => {
    const body = request.body as { address?: string }
    if (!body.address) throw new RoomError('bad-address', 'Address is required')
    return auth.nonce(body.address, now())
  })

  app.post('/auth/verify', async (request) => {
    const body = request.body as { address?: string; signature?: `0x${string}` }
    if (!body.address || !body.signature) {
      throw new RoomError('bad-signature', 'Address and signature are required', 401)
    }
    const session = await auth.verify(body.address, body.signature, now())
    book.ledger.ensure(session.address)
    return session
  })

  app.get('/me/balances', async (request: AuthedRequest) => {
    const address = requireUser(request)
    const balances = book.ledger.balances(address)
    return {
      available: balances.available.toString(),
      lockedInRooms: balances.locked.toString(),
      pendingSettlement: '0',
    }
  })

  app.post('/rooms/quote', async (request) => {
    const body = request.body as { stakeTier?: number }
    return book.quote(body.stakeTier ?? Number.NaN)
  })

  app.get('/rooms', async (request) => {
    const query = request.query as { visibility?: string }
    if (query.visibility && query.visibility !== 'public') {
      throw new RoomError('bad-visibility', 'This list is only for public rooms')
    }
    return book.listPublic()
  })

  app.post('/rooms', async (request: AuthedRequest, reply: FastifyReply) => {
    const address = requireUser(request)
    const body = request.body as { stakeTier?: number; visibility?: 'public' | 'private' }
    const visibility = body.visibility === 'private' ? 'private' : 'public'
    const room = book.create(address, body.stakeTier ?? Number.NaN, visibility)
    return reply.status(201).send(room)
  })

  app.get('/rooms/:roomId', async (request: AuthedRequest) => {
    const params = request.params as { roomId: string }
    return book.get(params.roomId, request.address ?? null)
  })

  app.post('/rooms/:roomId/fund', async (request: AuthedRequest) => {
    const params = request.params as { roomId: string }
    return book.fund(params.roomId, requireUser(request))
  })

  app.post('/rooms/:roomId/join', async (request: AuthedRequest) => {
    const params = request.params as { roomId: string }
    const body = request.body as { inviteCode?: string }
    return book.join(params.roomId, requireUser(request), body.inviteCode)
  })

  app.post('/rooms/:roomId/cancel', async (request: AuthedRequest) => {
    const params = request.params as { roomId: string }
    return book.cancel(params.roomId, requireUser(request))
  })

  app.post('/rooms/:roomId/ready', async (request: AuthedRequest) => {
    const params = request.params as { roomId: string }
    const body = request.body as { clientSeed?: string }
    const room = book.ready(params.roomId, requireUser(request), body.clientSeed ?? '')
    broadcast(params.roomId)
    return room
  })

  app.get('/rooms/:roomId/replay', async (request: AuthedRequest) => {
    const address = requireUser(request)
    const params = request.params as { roomId: string }
    const room = book.get(params.roomId, address)
    if (address !== room.host && address !== room.guest) {
      throw new RoomError('not-player', 'Only the players can read the replay')
    }
    return book.replay(params.roomId)
  })

  app.get('/ws', { websocket: true }, (connection, request) => {
    const query = request.query as { token?: string }
    const address = query.token ? auth.session(query.token, now()) : null
    const socket = connection.socket
    if (!address) {
      socket.close(4001, 'unauthorized')
      return
    }
    const connected = [...sockets.values()].reduce((sum, set) => sum + set.size, 0)
    if (connected >= maxSessions) {
      socket.close(4008, 'beta-cap')
      return
    }
    socketAddress.set(socket, address)
    const owned = sockets.get(address) ?? new Set<WebSocket>()
    owned.add(socket)
    sockets.set(address, owned)
    resultSent.set(socket, new Set())

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(String(raw)) as {
          type?: string
          roomId?: string
          actionId?: string
          action?: unknown
        }
        if (!message.roomId) throw new RoomError('bad-message', 'roomId is required')
        if (message.type === 'battle:sync') {
          book.reconnect(message.roomId, address)
        } else if (message.type === 'battle:action') {
          if (!message.actionId) throw new RoomError('bad-message', 'actionId is required')
          book.act(message.roomId, address, parseAction(message.action), message.actionId)
        } else {
          throw new RoomError('bad-message', 'Unknown socket message')
        }
        const watching = watchers.get(message.roomId) ?? new Set<WebSocket>()
        watching.add(socket)
        watchers.set(message.roomId, watching)
        broadcast(message.roomId)
      } catch (error) {
        const coded = error instanceof RoomError ? error : new RoomError('internal', 'Internal error', 500)
        send(socket, { type: 'error', code: coded.code, message: coded.message })
      }
    })

    socket.on('close', () => {
      owned.delete(socket)
      socketAddress.delete(socket)
      for (const [roomId, set] of watchers) {
        if (!set.delete(socket)) continue
        const stillWatching = [...(sockets.get(address) ?? [])].some((open) => set.has(open))
        if (!stillWatching) book.disconnect(roomId, address)
      }
    })
  })

  const tickMs = options?.tickMs ?? 200
  const timer =
    tickMs > 0
      ? setInterval(() => {
          book.tick()
          for (const roomId of watchers.keys()) broadcast(roomId)
        }, tickMs)
      : null
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer)
  })

  return Object.assign(app, { book, authStore: auth, clock: now })
}

function parseRoomId(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new RoomError('bad-room', 'Chain room id must be a decimal number')
  return BigInt(value)
}

function resultPayload(room: RoomView, match: PublicMatch | null) {
  return {
    type: 'battle:result',
    roomId: room.id,
    outcome: room.outcome,
    winner: room.winner,
    serverSeed: match?.serverSeed ?? null,
    rulesHash: room.rulesHash,
  }
}
