import { FAUCET_AMOUNT } from './config'
import { RoomError } from './errors'

export type Balances = {
  available: bigint
  locked: bigint
}

export class Ledger {
  private readonly accounts = new Map<string, Balances>()

  ensure(address: string): Balances {
    const existing = this.accounts.get(address)
    if (existing) return existing
    const created = { available: FAUCET_AMOUNT, locked: 0n }
    this.accounts.set(address, created)
    return created
  }

  balances(address: string): Balances {
    const account = this.ensure(address)
    return { available: account.available, locked: account.locked }
  }

  total(address: string): bigint {
    const account = this.ensure(address)
    return account.available + account.locked
  }

  lock(address: string, amount: bigint): void {
    const account = this.ensure(address)
    if (amount <= 0n) throw new RoomError('bad-amount', 'Lock amount must be positive')
    if (account.available < amount) {
      throw new RoomError('insufficient-credits', 'Not enough available test credits')
    }
    account.available -= amount
    account.locked += amount
  }

  refund(address: string, amount: bigint): void {
    const account = this.ensure(address)
    if (account.locked < amount) {
      throw new RoomError('ledger', 'Locked balance cannot cover that refund')
    }
    account.locked -= amount
    account.available += amount
  }

  /** Move both locked stakes to the winner. The house keeps nothing. */
  payPot(winner: string, loser: string, stake: bigint): void {
    const winnerAccount = this.ensure(winner)
    const loserAccount = this.ensure(loser)
    if (winnerAccount.locked < stake || loserAccount.locked < stake) {
      throw new RoomError('ledger', 'Both players must still have the stake locked')
    }
    winnerAccount.locked -= stake
    loserAccount.locked -= stake
    winnerAccount.available += stake * 2n
  }
}
