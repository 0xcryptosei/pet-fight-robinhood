import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '../wallet'
import { AccountButton } from './AccountButton'

const links = [
  { to: '/#how', label: 'Pets' },
  { to: '/#how', label: 'Battle' },
  { to: '/shop', label: 'Shop' },
  { to: '/#how', label: 'Wallet' },
]

export function Header() {
  const wallet = useWallet()
  const navigate = useNavigate()

  async function openHome() {
    if (wallet.connecting) return
    if (!wallet.address) {
      wallet.setOpen(true)
      const token = await wallet.connectMetaMask()
      if (!token) return
    }
    navigate('/home')
  }

  return (
    <header className="top">
      <div className="bar">
        <Link className="brand" to="/">
          <img src="/logo.png" alt="Pet Fight" />
        </Link>
        <nav className="nav" aria-label="Main">
          <button type="button" onClick={() => void openHome()}>
            Home
          </button>
          {links.map((link) => (
            <Link key={link.label} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="bar-end">
          <AccountButton />
        </div>
      </div>
    </header>
  )
}
