import { createPublicClient, http } from 'viem'
import { assertDepositsConfirmed } from './chain-gate'
import { ESCROW_STATUS, TESTNET, type EscrowStatusName } from './testnet'

const roomViewAbi = [
  {
    type: 'function',
    name: 'roomView',
    stateMutability: 'view',
    inputs: [{ name: 'roomId', type: 'uint256' }],
    outputs: [
      { name: 'host', type: 'address' },
      { name: 'guest', type: 'address' },
      { name: 'stake', type: 'uint256' },
      { name: 'stakeTier', type: 'uint16' },
      { name: 'roomFeeBps', type: 'uint16' },
      { name: 'joinDeadline', type: 'uint64' },
      { name: 'startDeadline', type: 'uint64' },
      { name: 'settleDeadline', type: 'uint64' },
      { name: 'startedAt', type: 'uint64' },
      { name: 'status', type: 'uint8' },
      { name: 'hostPetId', type: 'uint256' },
      { name: 'isPublic', type: 'bool' },
    ],
  },
] as const

const ZERO = '0x0000000000000000000000000000000000000000'

export type ChainRoomView = {
  roomId: string
  host: string
  guest: string
  stake: string
  stakeTier: number
  status: EscrowStatusName
  hostDeposit: boolean
  guestDeposit: boolean
}

type RoomViewResult = {
  readonly 0: string
  readonly 1: string
  readonly 2: bigint
  readonly 3: number
  readonly 9: number
}

export function describeChainRoom(roomId: bigint, view: RoomViewResult): ChainRoomView {
  const status = ESCROW_STATUS[view[9]] ?? 'NONE'
  const host = view[0]
  const guest = view[1]
  const funded = status === 'HOST_FUNDED' || status === 'READY' || status === 'SETTLED'
  return {
    roomId: roomId.toString(),
    host,
    guest,
    stake: view[2].toString(),
    stakeTier: view[3],
    status,
    hostDeposit: host !== ZERO && funded,
    guestDeposit: guest !== ZERO && (status === 'READY' || status === 'SETTLED'),
  }
}

export async function readChainRoom(roomId: bigint, rpc = TESTNET.rpc): Promise<ChainRoomView> {
  const client = createPublicClient({ transport: http(rpc) })
  const view = await client.readContract({
    address: TESTNET.escrow,
    abi: roomViewAbi,
    functionName: 'roomView',
    args: [roomId],
  })
  const described = describeChainRoom(roomId, view)
  return described
}

export function requireConfirmedRoom(room: ChainRoomView): ChainRoomView {
  assertDepositsConfirmed(room)
  return room
}
