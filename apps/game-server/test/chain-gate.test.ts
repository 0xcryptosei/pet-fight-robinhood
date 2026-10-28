import { describe, expect, it } from 'vitest'
import { assertDepositsConfirmed } from '../src/chain-gate'
import { RoomError } from '../src/errors'

describe('on-chain deposit gate', () => {
  it('requires a ready room with both deposits', () => {
    expect(() => assertDepositsConfirmed({ status: 'HOST_FUNDED', hostDeposit: true, guestDeposit: false })).toThrow(RoomError)
    expect(() => assertDepositsConfirmed({ status: 'READY', hostDeposit: true, guestDeposit: false })).toThrow(RoomError)
    expect(() => assertDepositsConfirmed({ status: 'READY', hostDeposit: true, guestDeposit: true })).not.toThrow()
  })
})
