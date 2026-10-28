import { Link } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/#how', label: 'Pets' },
  { to: '/#how', label: 'Battle' },
  { to: '/#how', label: 'Marketplace' },
  { to: '/#how', label: 'Wallet' },
]

export function Header() {
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
          <button className="btn wallet" type="button">
            Connect
            <img src="/wallet.png" alt="" />
          </button>
        </div>
      </div>
    </header>
  )
}
