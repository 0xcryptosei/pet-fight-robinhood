import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { shortAddress, useWallet } from '../wallet'

const links = [
  { to: '/', label: 'Home' },
  { to: '/#how', label: 'Pets' },
  { to: '/#how', label: 'Battle' },
  { to: '/#how', label: 'Marketplace' },
  { to: '/#how', label: 'Wallet' },
]

export function Header() {
  const wallet = useWallet()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return (
    <header className="top">
      <div className="bar">
        <Link className="brand" to="/">
          <img src="/logo.png" alt="Pet Fight" />
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((link) => (
            <Link key={link.label} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="bar-end">
          <div className="wallet-menu" ref={menuRef}>
            <button
              className={wallet.address ? 'btn wallet connected' : 'btn wallet'}
              type="button"
              aria-expanded={wallet.address ? menu : undefined}
              aria-haspopup={wallet.address ? 'menu' : undefined}
              onClick={() => {
                if (wallet.address) setMenu((open) => !open)
                else wallet.setOpen(true)
              }}
            >
              {wallet.address ? shortAddress(wallet.address) : 'Connect'}
              {wallet.address ? null : <img src="/wallet.png" alt="" />}
            </button>
            {wallet.address && menu ? (
              <div className="wallet-drop" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    wallet.disconnect()
                    setMenu(false)
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
