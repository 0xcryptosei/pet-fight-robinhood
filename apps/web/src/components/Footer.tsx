import { Link } from 'react-router-dom'
import { MailIcon, TelegramIcon, XIcon } from './Icons'

const links = [
  { to: '/docs#terms', label: 'Terms of Service' },
  { to: '/docs#privacy', label: 'Privacy' },
  { to: '/docs#fair-play', label: 'Fair-play rules' },
  { to: '/docs#contracts', label: 'Contract addresses' },
]

export function Footer() {
  return (
    <footer>
      <div className="bar foot">
        <span>© 2026 Pet Fight</span>
        {links.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
        <div className="social">
          <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X">
            <XIcon />
          </a>
          <a href="https://t.me" target="_blank" rel="noopener noreferrer" aria-label="Telegram">
            <TelegramIcon />
          </a>
          <a href="mailto:" aria-label="Email">
            <MailIcon />
          </a>
        </div>
      </div>
    </footer>
  )
}
