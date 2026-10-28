export const TIERS = [10, 20, 50, 100, 1000] as const
export type Tier = (typeof TIERS)[number]

export type Room = {
  id: string
  visibility: 'public' | 'private'
  host: string
  guest: string | null
  stakeTier: Tier
  stakeAmount: string
  pot: string
  status: string
  joinDeadline: number
  hostDeposit: boolean
  guestDeposit: boolean
  inviteCode?: string
}

export function isTier(value: number): value is Tier {
  return (TIERS as readonly number[]).includes(value)
}

export function formatPetc(wei: string | undefined): string {
  if (!wei || !/^\d+$/.test(wei)) return '—'
  return (BigInt(wei) / 10n ** 18n).toLocaleString('en-US')
}

export function tierWei(tier: Tier): bigint {
  return BigInt(tier) * 10n ** 18n
}

export async function api<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    let message = 'The game server rejected the request.'
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      if (response.status === 401) message = 'Sign in again.'
    }
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.json() as Promise<T>
}
