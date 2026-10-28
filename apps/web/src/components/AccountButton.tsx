import { useEffect, useRef, useState } from 'react'
import { shortAddress, useWallet } from '../wallet'

export function AccountButton({ appearance = 'button' }: { appearance?: 'button' | 'pill' }) {
  const wallet = useWallet()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const signedIn = Boolean(wallet.address)

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

  const className = signedIn && appearance === 'pill' ? 'account-pill' : signedIn ? 'btn wallet connected' : 'btn wallet'

  return (
    <div className="wallet-menu" ref={menuRef}>
      <button
        className={className}
        type="button"
        aria-expanded={signedIn ? menu : undefined}
        aria-haspopup={signedIn ? 'menu' : undefined}
        onClick={() => {
          if (wallet.address) setMenu((open) => !open)
          else wallet.setOpen(true)
        }}
      >
        {signedIn && appearance === 'pill' ? <i /> : null}
        {wallet.address ? shortAddress(wallet.address) : 'Connect'}
        {signedIn ? null : <img src="/wallet.png" alt="" />}
      </button>
      {signedIn && menu ? (
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
  )
}
