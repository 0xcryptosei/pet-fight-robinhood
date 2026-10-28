import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatPetc } from '../api'
import { readPetcBalance } from '../stake'
import { AccountButton } from './AccountButton'
import { useWallet } from '../wallet'

type Balances = {
  available: string
  lockedInRooms: string
}

const nav = [
  { label: 'Home', icon: 'home', to: '/home' },
  { label: 'My pets', icon: 'pets', to: '/pets' },
  { label: 'Battle rooms', icon: 'battle', to: '/rooms' },
  { label: 'Practice', icon: 'practice', to: '/practice' },
  { label: 'Marketplace', icon: 'market' },
  { label: 'Inventory', icon: 'inventory' },
  { label: 'Leaderboard', icon: 'board' },
]

function navOn(to: string, path: string): boolean {
  if (to === '/rooms') return path === '/rooms' || path.startsWith('/rooms/')
  return path === to
}

export function LobbyFrame({ children }: { children: ReactNode }) {
  const wallet = useWallet()
  const location = useLocation()
  const [available, setAvailable] = useState<bigint | null>(null)
  const [locked, setLocked] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) {
      setAvailable(null)
      setLocked(null)
      return
    }
    try {
      setAvailable(await readPetcBalance(wallet.address))
    } catch {
      setAvailable(null)
    }
    if (!wallet.token) {
      setLocked(null)
      return
    }
    try {
      const response = await fetch('/me/balances', { headers: { authorization: `Bearer ${wallet.token}` } })
      if (response.status === 401) {
        wallet.disconnect()
        setLocked(null)
        return
      }
      if (!response.ok) {
        setLocked(null)
        return
      }
      const balances = (await response.json()) as Balances
      setLocked(balances.lockedInRooms)
    } catch {
      setLocked(null)
    }
  }, [wallet])

  useEffect(() => {
    void load()
    window.addEventListener('petfight-petc', load)
    return () => window.removeEventListener('petfight-petc', load)
  }, [load, location.pathname])

  return (
    <div className="lobby">
      <header className="lobby-top">
        <Link className="lobby-brand" to="/">
          <img src="/logo.png" alt="Pet Fight" />
        </Link>
        <div className="lobby-balance">
          <img className="coin" src="/coin.png" alt="" />
          <div>
            <strong>{available === null ? '—' : formatPetc(available.toString())} available</strong>
            <span>{formatPetc(locked ?? undefined)} locked in rooms</span>
          </div>
        </div>
        <AccountButton appearance="pill" />
      </header>
      <aside className="lobby-side" aria-label="Lobby">
        {nav.map((item) =>
          item.to ? (
            <Link key={item.label} className={navOn(item.to, location.pathname) ? 'is-on' : undefined} to={item.to}>
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          ) : (
            <button key={item.label} type="button">
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ),
        )}
      </aside>
      {children}
    </div>
  )
}

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    )
  }
  if (name === 'pets') {
    return (
      <svg {...common}>
        <circle cx="6" cy="8" r="2" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="18" cy="8" r="2" />
        <path d="M8 14c0-2 1.5-3 4-3s4 1 4 3c0 3-2 5-4 6-2-1-4-3-4-6z" />
      </svg>
    )
  }
  if (name === 'battle') {
    return (
      <svg {...common}>
        <path d="M14 4l6 6-8 8H6v-6z" />
      </svg>
    )
  }
  if (name === 'practice') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    )
  }
  if (name === 'market') {
    return (
      <svg {...common}>
        <path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2" />
      </svg>
    )
  }
  if (name === 'inventory') {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 4v4h6V4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M8 20h8M12 16v4M7 4h10v4a5 5 0 0 1-10 0z" />
    </svg>
  )
}
