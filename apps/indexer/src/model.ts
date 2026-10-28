export const SPECIES: Record<number, { name: string; health: number; power: number; intelligence: number }> = {
  1: { name: 'Dog', health: 100, power: 70, intelligence: 50 },
  2: { name: 'Cat', health: 80, power: 55, intelligence: 90 },
  3: { name: 'Pig', health: 120, power: 75, intelligence: 45 },
  4: { name: 'Bird', health: 65, power: 45, intelligence: 70 },
}

export type Pet = {
  tokenId: string
  owner: string
  speciesId: number
  level: number
  xpCheckpoint: bigint
  metadataVersion: number
}

export type Room = {
  host: string
  guest: string
  stake: bigint
  started: boolean
  status: string
}

export type BalanceView = {
  available: string
  lockedInRooms: string
  pendingSettlement: string
  blockNumber: string
}

type Delta = {
  available: Array<[string, bigint]>
  locked: Array<[string, bigint]>
  pending: Array<[string, bigint]>
  pets: Array<{ id: string; before: Pet | null }>
  room: { id: string; before: Room | null } | null
}

export type ReadModel = {
  blockNumber: bigint
  pets: Map<string, Pet>
  rooms: Map<string, Room>
  available: Map<string, bigint>
  locked: Map<string, bigint>
  pending: Map<string, bigint>
  applied: Map<string, Delta>
}

export function emptyModel(): ReadModel {
  return {
    blockNumber: 0n,
    pets: new Map(),
    rooms: new Map(),
    available: new Map(),
    locked: new Map(),
    pending: new Map(),
    applied: new Map(),
  }
}

export function logKey(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`
}

export function balancesOf(model: ReadModel, wallet: string): BalanceView {
  const key = wallet.toLowerCase()
  return {
    available: (model.available.get(key) ?? 0n).toString(),
    lockedInRooms: (model.locked.get(key) ?? 0n).toString(),
    pendingSettlement: (model.pending.get(key) ?? 0n).toString(),
    blockNumber: model.blockNumber.toString(),
  }
}

export function petsOf(model: ReadModel, wallet: string): Pet[] {
  const key = wallet.toLowerCase()
  return [...model.pets.values()].filter((pet) => pet.owner === key).sort((a, b) => Number(a.tokenId) - Number(b.tokenId))
}

export function formatPetc(wei: bigint): string {
  const negative = wei < 0n
  const value = negative ? -wei : wei
  const whole = value / 10n ** 18n
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')
  const text = fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`
  return negative ? `-${text}` : text
}

export function bump(map: Map<string, bigint>, wallet: string, amount: bigint, delta: Array<[string, bigint]>) {
  if (amount === 0n || wallet === '0x0000000000000000000000000000000000000000') return
  const key = wallet.toLowerCase()
  map.set(key, (map.get(key) ?? 0n) + amount)
  delta.push([key, amount])
}

export function rememberPet(model: ReadModel, delta: Delta, tokenId: string) {
  const current = model.pets.get(tokenId)
  delta.pets.push({ id: tokenId, before: current ? { ...current } : null })
}

export function rememberRoom(model: ReadModel, delta: Delta, roomId: string) {
  const current = model.rooms.get(roomId)
  delta.room = { id: roomId, before: current ? { ...current } : null }
}

export function invert(model: ReadModel, delta: Delta) {
  for (const [wallet, amount] of delta.available) bump(model.available, wallet, -amount, [])
  for (const [wallet, amount] of delta.locked) bump(model.locked, wallet, -amount, [])
  for (const [wallet, amount] of delta.pending) bump(model.pending, wallet, -amount, [])
  for (const pet of delta.pets) {
    if (pet.before) model.pets.set(pet.id, pet.before)
    else model.pets.delete(pet.id)
  }
  if (delta.room) {
    if (delta.room.before) model.rooms.set(delta.room.id, delta.room.before)
    else model.rooms.delete(delta.room.id)
  }
}
