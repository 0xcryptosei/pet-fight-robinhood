import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const TESTNET_CHAIN_ID = '0xb626'
const SESSION_KEY = 'petfight.session'

type Session = {
  token: string
  address: string
  expiresAt: number
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type WalletContextValue = {
  address: string | null
  token: string | null
  open: boolean
  setOpen: (open: boolean) => void
  connecting: boolean
  error: string | null
  hasWallet: boolean
  connectMetaMask: () => Promise<string | null>
  disconnect: () => void
  clearError: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

function getEthereum(): EthereumProvider | null {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum
  return ethereum?.request ? ethereum : null
}

function errorCode(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'number') return code
  }
  return null
}

function firstAddress(result: unknown): string | null {
  if (!Array.isArray(result)) return null
  const found = result.find((item) => typeof item === 'string' && /^0x[0-9a-fA-F]{40}$/.test(item))
  return typeof found === 'string' ? found.toLowerCase() : null
}

async function switchToTestnet(ethereum: EthereumProvider): Promise<void> {
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TESTNET_CHAIN_ID }],
    })
  } catch (error) {
    if (errorCode(error) !== 4902) throw error
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: TESTNET_CHAIN_ID,
          chainName: 'Robinhood Chain Testnet',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
          blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'],
        },
      ],
    })
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function readSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as Partial<Session>
    if (!session.token || !session.address || typeof session.expiresAt !== 'number') return null
    if (session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return { token: session.token, address: session.address, expiresAt: session.expiresAt }
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

function saveSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

async function serverError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) return body.message
  } catch {
    // The server was unreachable or did not return JSON.
  }
  return fallback
}

async function signIn(ethereum: EthereumProvider, address: string): Promise<Session> {
  let nonceResponse: Response
  try {
    nonceResponse = await fetch('/auth/nonce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    })
  } catch {
    throw new Error('The game server is not running.')
  }
  if (!nonceResponse.ok) throw new Error(await serverError(nonceResponse, 'Could not start sign-in.'))
  const nonceBody = (await nonceResponse.json()) as { message?: string }
  if (!nonceBody.message) throw new Error('The server did not return a login message.')

  const signature = await ethereum.request({
    method: 'personal_sign',
    params: [nonceBody.message, address],
  })
  if (typeof signature !== 'string' || !signature.startsWith('0x')) {
    throw new Error('The wallet did not return a signature.')
  }

  const verifyResponse = await fetch('/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  })
  if (!verifyResponse.ok) throw new Error(await serverError(verifyResponse, 'The signature was rejected.'))
  const session = (await verifyResponse.json()) as Partial<Session>
  if (!session.token || !session.address || typeof session.expiresAt !== 'number') {
    throw new Error('The server did not open a session.')
  }
  return { token: session.token, address: session.address, expiresAt: session.expiresAt }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const existing = readSession()
  const [address, setAddress] = useState<string | null>(existing?.address ?? null)
  const [token, setToken] = useState<string | null>(existing?.token ?? null)
  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasWallet, setHasWallet] = useState(false)
  const connectingRef = useRef(false)

  useEffect(() => {
    setHasWallet(Boolean(getEthereum()))
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      token,
      open,
      setOpen,
      connecting,
      error,
      hasWallet,
      clearError: () => setError(null),
      disconnect() {
        sessionStorage.removeItem(SESSION_KEY)
        setToken(null)
        setAddress(null)
        setOpen(false)
        setError(null)
      },
      async connectMetaMask() {
        if (connectingRef.current) return null
        const ethereum = getEthereum()
        if (!ethereum) {
          setOpen(true)
          setError('MetaMask is not installed in this browser.')
          return null
        }
        connectingRef.current = true
        setConnecting(true)
        setError(null)
        try {
          const result = await ethereum.request({ method: 'eth_requestAccounts' })
          const selected = Array.isArray(result) ? result.find((item) => typeof item === 'string') : null
          const next = firstAddress(result)
          if (!next || typeof selected !== 'string') throw new Error('The wallet did not return an address.')
          await switchToTestnet(ethereum)
          const session = await signIn(ethereum, selected)
          saveSession(session)
          setToken(session.token)
          setAddress(session.address)
          setOpen(false)
          return session.token
        } catch (caught) {
          if (errorCode(caught) === 4001) setError('The wallet request was cancelled.')
          else if (caught instanceof Error && caught.message) setError(caught.message)
          else setError('Could not connect the wallet.')
          return null
        } finally {
          connectingRef.current = false
          setConnecting(false)
        }
      },
    }),
    [address, token, open, connecting, error, hasWallet],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext)
  if (!value) throw new Error('WalletProvider is missing')
  return value
}
