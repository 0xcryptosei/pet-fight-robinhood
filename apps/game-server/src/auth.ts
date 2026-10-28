import { randomBytes } from 'node:crypto'
import { verifyMessage } from 'viem'
import { PHASE2 } from './config'
import { RoomError } from './errors'

export type AuthStore = {
  nonce(address: string, now: number): { message: string; nonce: string; expiresAt: number }
  verify(
    address: string,
    signature: `0x${string}`,
    now: number,
  ): Promise<{ token: string; address: string; expiresAt: number }>
  session(token: string, now: number): string | null
}

type NonceRecord = {
  address: string
  nonce: string
  expiresAt: number
  used: boolean
}

export function normalizeAddress(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/i.test(value)) {
    throw new RoomError('bad-address', 'Wallet address is not a 20-byte hex address')
  }
  return value.toLowerCase()
}

export function loginMessage(address: string, nonce: string): string {
  return `Pet Fight test login\nAddress: ${address}\nNonce: ${nonce}`
}

export function createAuthStore(): AuthStore {
  const nonces = new Map<string, NonceRecord>()
  const sessions = new Map<string, { address: string; expiresAt: number }>()

  return {
    nonce(rawAddress, now) {
      const address = normalizeAddress(rawAddress)
      const nonce = randomBytes(16).toString('hex')
      const expiresAt = now + PHASE2.nonceTtlMs
      nonces.set(nonce, { address, nonce, expiresAt, used: false })
      return { message: loginMessage(address, nonce), nonce, expiresAt }
    },

    async verify(rawAddress, signature, now) {
      const address = normalizeAddress(rawAddress)
      const pending = [...nonces.values()].find(
        (record) => record.address === address && !record.used && record.expiresAt > now,
      )
      if (!pending) {
        throw new RoomError('bad-nonce', 'Nonce is missing, used, or expired', 401)
      }
      let ok = false
      try {
        ok = await verifyMessage({
          address: address as `0x${string}`,
          message: loginMessage(address, pending.nonce),
          signature,
        })
      } catch {
        ok = false
      }
      if (!ok) {
        throw new RoomError('bad-signature', 'Wallet signature does not match the nonce', 401)
      }
      pending.used = true
      const token = randomBytes(32).toString('hex')
      const expiresAt = now + PHASE2.sessionTtlMs
      sessions.set(token, { address, expiresAt })
      return { token, address, expiresAt }
    },

    session(token, now) {
      const found = sessions.get(token)
      if (!found || found.expiresAt <= now) return null
      return found.address
    },
  }
}
