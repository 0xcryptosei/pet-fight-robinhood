import { decodeEventLog, type Hex } from 'viem'
import {
  bump,
  emptyModel,
  invert,
  logKey,
  rememberPet,
  rememberRoom,
  type Pet,
  type ReadModel,
  type Room,
} from './model'

const ZERO = '0x0000000000000000000000000000000000000000'

export const escrowAbi = [
  {
    type: 'event',
    name: 'RoomCreated',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'host', type: 'address', indexed: true },
      { name: 'stakeTier', type: 'uint16', indexed: false },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
      { name: 'rulesVersion', type: 'uint32', indexed: false },
      { name: 'rulesHash', type: 'bytes32', indexed: false },
      { name: 'joinDeadline', type: 'uint64', indexed: false },
      { name: 'hostPetId', type: 'uint256', indexed: false },
      { name: 'isPublic', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoomFunded',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'host', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoomJoined',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'guest', type: 'address', indexed: true },
      { name: 'guestPetId', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'startDeadline', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoomStarted',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'startedAt', type: 'uint64', indexed: false },
      { name: 'settleDeadline', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoomSettled',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'matchId', type: 'bytes32', indexed: true },
      { name: 'winner', type: 'address', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'transcriptHash', type: 'bytes32', indexed: false },
      { name: 'player1Rounds', type: 'uint8', indexed: false },
      { name: 'player2Rounds', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RoomRefunded',
    inputs: [
      { name: 'roomId', type: 'uint256', indexed: true },
      { name: 'status', type: 'uint8', indexed: false },
      { name: 'reason', type: 'uint8', indexed: false },
      { name: 'hostAmount', type: 'uint256', indexed: false },
      { name: 'guestAmount', type: 'uint256', indexed: false },
    ],
  },
] as const

export const petAbi = [
  {
    type: 'event',
    name: 'StarterClaimed',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'speciesId', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProgressionUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'level', type: 'uint16', indexed: false },
      { name: 'xpCheckpoint', type: 'uint64', indexed: false },
      { name: 'metadataVersion', type: 'uint32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

export const coinAbi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

export type ChainLog = {
  address: Hex
  topics: Hex[]
  data: Hex
  chainId: number
  txHash: Hex
  logIndex: number
  blockNumber: bigint
  removed?: boolean
}

export type IndexerContracts = {
  petc: Hex
  pets: Hex
  escrow: Hex
}

type Effect = {
  available: Array<[string, bigint]>
  locked: Array<[string, bigint]>
  pending: Array<[string, bigint]>
  pets: Array<{ id: string; before: Pet | null }>
  room: { id: string; before: Room | null } | null
}

function blankEffect(): Effect {
  return { available: [], locked: [], pending: [], pets: [], room: null }
}

function roomOrBlank(model: ReadModel, roomId: string): Room {
  return (
    model.rooms.get(roomId) ?? {
      host: ZERO,
      guest: ZERO,
      stake: 0n,
      started: false,
      status: 'NONE',
    }
  )
}

export function applyLog(model: ReadModel, log: ChainLog, contracts: IndexerContracts): ReadModel {
  const key = logKey(log.chainId, log.txHash, log.logIndex)
  if (log.removed) {
    const prior = model.applied.get(key)
    if (prior) {
      invert(model, prior)
      model.applied.delete(key)
    }
    return model
  }
  if (model.applied.has(key)) return model

  const effect = blankEffect()
  const decoded = decode(log, contracts)
  if (decoded) affect(model, effect, decoded)
  model.applied.set(key, effect)
  if (log.blockNumber > model.blockNumber) model.blockNumber = log.blockNumber
  return model
}

export function applyLogs(logs: ChainLog[], contracts: IndexerContracts, model = emptyModel()): ReadModel {
  for (const log of logs) applyLog(model, log, contracts)
  return model
}

function topicsOf(log: ChainLog): [Hex, ...Hex[]] | null {
  const [signature, ...rest] = log.topics
  if (!signature) return null
  return [signature, ...rest]
}

function decode(log: ChainLog, contracts: IndexerContracts) {
  const topics = topicsOf(log)
  if (!topics) return null
  const address = log.address.toLowerCase()
  if (address === contracts.escrow.toLowerCase()) {
    return decodeEventLog({ abi: escrowAbi, data: log.data, topics })
  }
  if (address === contracts.pets.toLowerCase()) {
    return decodeEventLog({ abi: petAbi, data: log.data, topics })
  }
  if (address === contracts.petc.toLowerCase()) {
    return decodeEventLog({ abi: coinAbi, data: log.data, topics })
  }
  return null
}

function affect(model: ReadModel, effect: Effect, decoded: ReturnType<typeof decodeEventLog>) {
  const name = decoded.eventName
  const args = decoded.args as Record<string, unknown>
  if (name === 'Transfer' && args.value !== undefined) {
    const from = String(args.from)
    const to = String(args.to)
    const value = BigInt(args.value as bigint)
    bump(model.available, from, -value, effect.available)
    bump(model.available, to, value, effect.available)
    return
  }
  if (name === 'Transfer') {
    const tokenId = (args.tokenId as bigint).toString()
    const to = String(args.to).toLowerCase()
    rememberPet(model, effect, tokenId)
    const pet = model.pets.get(tokenId) ?? {
      tokenId,
      owner: String(args.from).toLowerCase(),
      speciesId: 0,
      level: 1,
      xpCheckpoint: 0n,
      metadataVersion: 1,
    }
    model.pets.set(tokenId, { ...pet, owner: to })
    return
  }
  if (name === 'StarterClaimed') {
    const tokenId = (args.tokenId as bigint).toString()
    rememberPet(model, effect, tokenId)
    const existing = model.pets.get(tokenId)
    model.pets.set(tokenId, {
      tokenId,
      owner: String(args.owner).toLowerCase(),
      speciesId: Number(args.speciesId),
      level: existing?.level ?? 1,
      xpCheckpoint: existing?.xpCheckpoint ?? 0n,
      metadataVersion: existing?.metadataVersion ?? 1,
    })
    return
  }
  if (name === 'ProgressionUpdated') {
    const tokenId = (args.tokenId as bigint).toString()
    rememberPet(model, effect, tokenId)
    const pet = model.pets.get(tokenId)
    if (!pet) return
    model.pets.set(tokenId, {
      ...pet,
      level: Number(args.level),
      xpCheckpoint: BigInt(args.xpCheckpoint as bigint),
      metadataVersion: Number(args.metadataVersion),
    })
    return
  }
  if (name === 'RoomCreated') {
    const roomId = (args.roomId as bigint).toString()
    rememberRoom(model, effect, roomId)
    model.rooms.set(roomId, {
      host: String(args.host).toLowerCase(),
      guest: ZERO,
      stake: BigInt(args.stake as bigint),
      started: false,
      status: 'CREATED',
    })
    return
  }
  if (name === 'RoomFunded' || name === 'RoomJoined') {
    const roomId = (args.roomId as bigint).toString()
    const amount = BigInt(args.amount as bigint)
    const who = String(name === 'RoomFunded' ? args.host : args.guest).toLowerCase()
    rememberRoom(model, effect, roomId)
    const room = roomOrBlank(model, roomId)
    model.rooms.set(roomId, {
      ...room,
      host: name === 'RoomFunded' ? who : room.host,
      guest: name === 'RoomJoined' ? who : room.guest,
      stake: amount,
      status: name === 'RoomFunded' ? 'HOST_FUNDED' : 'READY',
    })
    bump(model.locked, who, amount, effect.locked)
    return
  }
  if (name === 'RoomStarted') {
    const roomId = (args.roomId as bigint).toString()
    const room = roomOrBlank(model, roomId)
    rememberRoom(model, effect, roomId)
    model.rooms.set(roomId, { ...room, started: true, status: 'READY' })
    for (const who of [room.host, room.guest]) {
      bump(model.locked, who, -room.stake, effect.locked)
      bump(model.pending, who, room.stake, effect.pending)
    }
    return
  }
  if (name === 'RoomSettled') {
    const roomId = (args.roomId as bigint).toString()
    const room = roomOrBlank(model, roomId)
    rememberRoom(model, effect, roomId)
    model.rooms.set(roomId, { ...room, status: 'SETTLED' })
    for (const who of [room.host, room.guest]) {
      bump(model.pending, who, -room.stake, effect.pending)
    }
    return
  }
  if (name === 'RoomRefunded') {
    const roomId = (args.roomId as bigint).toString()
    const room = roomOrBlank(model, roomId)
    const hostAmount = BigInt(args.hostAmount as bigint)
    const guestAmount = BigInt(args.guestAmount as bigint)
    rememberRoom(model, effect, roomId)
    const bucket = room.started ? effect.pending : effect.locked
    const map = room.started ? model.pending : model.locked
    bump(map, room.host, -hostAmount, bucket)
    bump(map, room.guest, -guestAmount, bucket)
    model.rooms.set(roomId, { ...room, status: Number(args.status) === 5 ? 'CANCELLED' : 'EXPIRED' })
  }
}
