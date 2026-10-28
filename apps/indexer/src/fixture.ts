import { encodeAbiParameters, encodeEventTopics, type AbiEvent, type Hex } from 'viem'
import { applyLogs, coinAbi, escrowAbi, petAbi, type ChainLog, type IndexerContracts } from './reduce'
import { type ReadModel } from './model'

export const CONTRACTS: IndexerContracts = {
  petc: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  pets: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  escrow: '0xcccccccccccccccccccccccccccccccccccccccc',
}

export const HOST = '0x1111111111111111111111111111111111111111'
export const GUEST = '0x2222222222222222222222222222222222222222'
export const STAKE = 20n * 10n ** 18n
export const FAUCET = 10_000n * 10n ** 18n

const ZERO = '0x0000000000000000000000000000000000000000' as Hex

function eventItem(abi: readonly AbiEvent[], name: string): AbiEvent {
  const item = abi.find((entry) => entry.name === name)
  if (!item) throw new Error(`Missing event ${name}`)
  return item
}

function chainLog(address: Hex, item: AbiEvent, args: Record<string, unknown>, index: number): ChainLog {
  const topics = encodeEventTopics({
    abi: [item],
    eventName: item.name,
    args,
  })
  const dataInputs = item.inputs.filter((input) => !input.indexed)
  const data =
    dataInputs.length === 0
      ? '0x'
      : encodeAbiParameters(
          dataInputs,
          dataInputs.map((input) => {
            if (!input.name) throw new Error('Event field is unnamed')
            return args[input.name]
          }),
        )
  return {
    address,
    topics: topics as Hex[],
    data,
    chainId: 31337,
    txHash: `0x${index.toString(16).padStart(64, '0')}`,
    logIndex: index,
    blockNumber: BigInt(index + 1),
  }
}

export function sampleLogs(): ChainLog[] {
  const coin = (name: string) => eventItem(coinAbi, name)
  const pet = (name: string) => eventItem(petAbi, name)
  const room = (name: string) => eventItem(escrowAbi, name)
  const rulesHash = `0x${'ab'.repeat(32)}` as Hex
  return [
    chainLog(CONTRACTS.petc, coin('Transfer'), { from: ZERO, to: HOST, value: FAUCET }, 0),
    chainLog(CONTRACTS.petc, coin('Transfer'), { from: ZERO, to: GUEST, value: FAUCET }, 1),
    chainLog(CONTRACTS.pets, pet('Transfer'), { from: ZERO, to: HOST, tokenId: 1n }, 2),
    chainLog(CONTRACTS.pets, pet('StarterClaimed'), { owner: HOST, tokenId: 1n, speciesId: 1 }, 3),
    chainLog(CONTRACTS.pets, pet('Transfer'), { from: ZERO, to: GUEST, tokenId: 2n }, 4),
    chainLog(CONTRACTS.pets, pet('StarterClaimed'), { owner: GUEST, tokenId: 2n, speciesId: 1 }, 5),
    chainLog(CONTRACTS.pets, pet('ProgressionUpdated'), { tokenId: 1n, level: 4, xpCheckpoint: 0n, metadataVersion: 3 }, 6),
    chainLog(
      CONTRACTS.escrow,
      room('RoomCreated'),
      {
        roomId: 1n,
        host: HOST,
        stakeTier: 20,
        stake: STAKE,
        feeBps: 0,
        rulesVersion: 1,
        rulesHash,
        joinDeadline: 1_700_000_000n,
        hostPetId: 1n,
        isPublic: true,
      },
      7,
    ),
    chainLog(CONTRACTS.petc, coin('Transfer'), { from: HOST, to: CONTRACTS.escrow, value: STAKE }, 8),
    chainLog(CONTRACTS.escrow, room('RoomFunded'), { roomId: 1n, host: HOST, amount: STAKE }, 9),
    chainLog(CONTRACTS.petc, coin('Transfer'), { from: GUEST, to: CONTRACTS.escrow, value: STAKE }, 10),
    chainLog(
      CONTRACTS.escrow,
      room('RoomJoined'),
      { roomId: 1n, guest: GUEST, guestPetId: 2n, amount: STAKE, startDeadline: 1_700_000_100n },
      11,
    ),
    chainLog(CONTRACTS.escrow, room('RoomStarted'), { roomId: 1n, startedAt: 1_700_000_050n, settleDeadline: 1_700_001_850n }, 12),
    chainLog(CONTRACTS.petc, coin('Transfer'), { from: CONTRACTS.escrow, to: HOST, value: STAKE * 2n }, 13),
    chainLog(
      CONTRACTS.escrow,
      room('RoomSettled'),
      {
        roomId: 1n,
        matchId: `0x${'11'.repeat(32)}` as Hex,
        winner: HOST,
        payout: STAKE * 2n,
        fee: 0n,
        transcriptHash: `0x${'22'.repeat(32)}` as Hex,
        player1Rounds: 2,
        player2Rounds: 0,
      },
      14,
    ),
  ]
}

export function sampleModel(): ReadModel {
  return applyLogs(sampleLogs(), CONTRACTS)
}
