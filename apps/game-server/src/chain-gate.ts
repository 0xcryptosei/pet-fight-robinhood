import { RoomError } from './errors'

export type ChainRoomDeposits = {
  status: string
  hostDeposit: boolean
  guestDeposit: boolean
}

/** On-chain combat may be marked started only after both tier deposits are in a READY room. */
export function assertDepositsConfirmed(room: ChainRoomDeposits): void {
  if (room.status !== 'READY' || !room.hostDeposit || !room.guestDeposit) {
    throw new RoomError('deposits-unconfirmed', 'Both deposits must be confirmed before the match starts', 409)
  }
}
