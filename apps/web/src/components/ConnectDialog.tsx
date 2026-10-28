import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shortAddress, useWallet } from '../wallet'

const unwired = [
  { id: 'walletconnect', mark: 'W', name: 'WalletConnect', tone: 'blue' },
  { id: 'coinbase', mark: 'C', name: 'Coinbase Wallet', tone: 'indigo' },
  { id: 'rainbow', mark: 'R', name: 'Rainbow', tone: 'purple' },
]

export function ConnectDialog() {
  const wallet = useWallet()
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!wallet.open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') wallet.setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wallet])

  if (!wallet.open) return null

  return (
    <div className="wallet-backdrop" onClick={() => wallet.setOpen(false)}>
      <div
        className="wallet-dialog"
        role="dialog"
        aria-labelledby="cw-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wallet-head">
          <div>
            <h2 id="cw-title">Connect your wallet</h2>
            <p>MetaMask will ask you to connect, then confirm a sign-in message. No transaction is sent.</p>
          </div>
          <button className="wallet-close" type="button" aria-label="Close" onClick={() => wallet.setOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="wallet-list">
          <button className="wallet-option" type="button" disabled={wallet.connecting} onClick={() => void wallet.connectMetaMask()}>
            <span className="wallet-mark gold">M</span>
            <span className="wallet-name">MetaMask</span>
            <span className={wallet.hasWallet ? 'wallet-badge' : 'wallet-hint'}>
              {wallet.connecting ? 'Confirm in wallet' : wallet.address ? shortAddress(wallet.address) : wallet.hasWallet ? 'Detected' : 'Not installed'}
            </span>
          </button>
          {unwired.map((item) => (
            <button
              key={item.id}
              className="wallet-option"
              type="button"
              onClick={() => {
                wallet.clearError()
                setNotice(`${item.name} is not wired in this beta. Use MetaMask.`)
              }}
            >
              <span className={`wallet-mark ${item.tone}`}>{item.mark}</span>
              <span className="wallet-name">{item.name}</span>
              <span className="wallet-hint">Not wired</span>
            </button>
          ))}
        </div>

        {wallet.error ? <p className="wallet-error">{wallet.error}</p> : null}
        {notice ? <p className="wallet-error">{notice}</p> : null}

        <div className="wallet-network">
          <i />
          <span>
            Network: <strong>Robinhood Chain Testnet</strong> (chain ID 46630). We'll ask your wallet to switch if needed.
          </span>
        </div>

        <div className="wallet-safe">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6EE7B7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>Pet Fight never asks for your seed phrase or private key.</span>
        </div>

        <p className="wallet-legal">
          By connecting, you agree to the <Link to="/docs#terms" onClick={() => wallet.setOpen(false)}>Terms of Service</Link> and{' '}
          <Link to="/docs#privacy" onClick={() => wallet.setOpen(false)}>Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}
