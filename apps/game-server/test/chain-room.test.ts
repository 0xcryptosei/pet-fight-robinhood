import { describe, expect, it } from 'vitest'
import { describeChainRoom, type ChainRoomView } from '../src/chain-room'
import { FAUCET_AMOUNT } from '../src/config'
import { RoomError } from '../src/errors'
import { Ledger } from '../src/ledger'
import { RoomBook } from '../src/rooms'

const ZERO = '0x0000000000000000000000000000000000000000'
const HOST = '0x1111111111111111111111111111111111111111'
const GUEST = '0x2222222222222222222222222222222222222222'

function view(status: number, guest = GUEST) {
  return [HOST, guest, 20n * 10n ** 18n, 20, 0, 0n, 0n, 0n, 0n, status, 1n, true] as const
}

describe('chain rooms', () => {
  it('confirms a ready escrow room and ignores an unfunded one', () => {
    const ready = describeChainRoom(4n, view(3))
    expect(ready.status).toBe('READY')
    expect(ready.hostDeposit).toBe(true)
    expect(ready.guestDeposit).toBe(true)
    const funded = describeChainRoom(4n, view(2, ZERO))
    expect(funded.status).toBe('HOST_FUNDED')
    expect(funded.guestDeposit).toBe(false)
  })

  it('opens a match session without moving test credits', () => {
    const ledger = new Ledger()
    ledger.ensure(HOST)
    ledger.ensure(GUEST)
    const book = new RoomBook(ledger, () => 1_700_000_000_000)
    const chain: ChainRoomView = describeChainRoom(4n, view(3))
    const room = book.openFromChain(HOST, chain)
    expect(room.id).toBe('4')
    expect(room.custody).toBe('chain')
    expect(room.status).toBe('READY')
    expect(ledger.balances(HOST).available).toBe(FAUCET_AMOUNT)
    expect(ledger.balances(GUEST).locked).toBe(0n)
    expect(() => book.openFromChain('0x3333333333333333333333333333333333333333', chain)).toThrow(RoomError)
  })
})
