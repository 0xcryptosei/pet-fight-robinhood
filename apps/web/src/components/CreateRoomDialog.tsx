import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formatPetc, isTier, TIERS, tierWei, type Room, type Tier } from '../api'
import { FIGHTERS, rememberFighter, type FighterId } from '../fighters'
import { useWallet } from '../wallet'

const TIER_COIN: Record<Tier, string> = {
  10: '/tier-10.png',
  20: '/tier-20.png',
  50: '/tier-50.png',
  100: '/tier-100.png',
  1000: '/tier-1000.png',
}

export function CreateRoomDialog({
  open,
  initialTier,
  onClose,
}: {
  open: boolean
  initialTier: Tier
  onClose: () => void
}) {
  const wallet = useWallet()
  const navigate = useNavigate()
  const [tier, setTier] = useState<Tier>(initialTier)
  const [fighter, setFighter] = useState<FighterId>('dog')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [available, setAvailable] = useState<bigint | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTier(initialTier)
    setFighter('dog')
    setVisibility('public')
    setNotice(null)
  }, [open, initialTier])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !wallet.token) {
      setAvailable(null)
      return
    }
    let cancel = false
    void api<{ available: string }>('/me/balances', wallet.token)
      .then((balances) => {
        if (!cancel && /^\d+$/.test(balances.available)) setAvailable(BigInt(balances.available))
      })
      .catch(() => {
        if (!cancel) setAvailable(null)
      })
    return () => {
      cancel = true
    }
  }, [open, wallet.token])

  if (!open) return null

  const entry = tierWei(tier)
  const short = available !== null && available < entry
  const after = available === null ? null : available > entry ? available - entry : 0n

  async function createRoom() {
    if (busy) return
    let token = wallet.token
    if (!token) {
      wallet.setOpen(true)
      token = await wallet.connectMetaMask()
      if (!token) return
    }
    setBusy(true)
    setNotice(null)
    try {
      const room = await api<Room>('/rooms', token, {
        method: 'POST',
        body: JSON.stringify({ stakeTier: tier, visibility }),
      })
      if (!isTier(room.stakeTier)) throw new Error('The server returned an unknown stake tier.')
      const funded = await api<Room>(`/rooms/${room.id}/fund`, token, { method: 'POST' })
      rememberFighter(funded.id, fighter)
      onClose()
      navigate(`/rooms/${funded.id}`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not create the room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wallet-backdrop room-backdrop" onClick={onClose}>
      <div
        className="room-dialog"
        role="dialog"
        aria-labelledby="create-room-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="room-dialog-head">
          <div>
            <h2 id="create-room-title">Create a room</h2>
            <p>Pick a stake tier and your fighter.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <fieldset>
          <legend>Stake tier (PETC)</legend>
          <div className="room-tiers">
            {TIERS.map((value) => (
              <button
                key={value}
                type="button"
                className={value === tier ? 'is-on' : undefined}
                aria-pressed={value === tier}
                onClick={() => setTier(value)}
              >
                <img src={TIER_COIN[value]} alt={`${value.toLocaleString('en-US')} PETC`} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Fighter</legend>
          <div className="room-fighters">
            {FIGHTERS.map((pet) => (
              <button
                key={pet.id}
                type="button"
                className={pet.id === fighter ? 'is-on' : undefined}
                aria-pressed={pet.id === fighter}
                onClick={() => setFighter(pet.id)}
              >
                <img src={pet.src} alt="" />
                <span>{pet.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Visibility</legend>
          <div className="room-visibility">
            <button
              type="button"
              className={visibility === 'public' ? 'is-on' : undefined}
              aria-pressed={visibility === 'public'}
              onClick={() => setVisibility('public')}
            >
              Public lobby
            </button>
            <button
              type="button"
              className={visibility === 'private' ? 'is-on' : undefined}
              aria-pressed={visibility === 'private'}
              onClick={() => setVisibility('private')}
            >
              Private invite link
            </button>
          </div>
        </fieldset>

        <section className="room-summary" aria-label="Summary">
          <p><span>Your entry</span><strong>{tier.toLocaleString('en-US')} PETC</strong></p>
          <p><span>Opponent entry</span><strong>{tier.toLocaleString('en-US')} PETC</strong></p>
          <p><span>Platform fee</span><strong>0</strong></p>
          <p className="room-pot"><span>Winner receives</span><strong>{(tier * 2).toLocaleString('en-US')} PETC</strong></p>
          <div>
            <p className="room-win">If you win<strong>+{tier.toLocaleString('en-US')} net</strong></p>
            <p className="room-lose">If you lose<strong>−{tier.toLocaleString('en-US')} net</strong></p>
          </div>
        </section>

        <ul className="room-notes">
          <li>
            {tier.toLocaleString('en-US')} PETC test credits are locked on the game server until the match ends. Available after:{' '}
            <strong>{after === null ? '—' : formatPetc(after.toString())}</strong>.
          </li>
          <li>No opponent in 10 minutes? Cancel any time for a full refund.</li>
        </ul>

        {notice ? <p className="lobby-notice">{notice}</p> : null}
        {short ? <p className="lobby-notice">Not enough test PETC for this tier.</p> : null}

        <button className="room-lock" type="button" disabled={busy || short} onClick={() => void createRoom()}>
          Lock {tier.toLocaleString('en-US')} PETC & create room
        </button>
        <button className="room-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
        <p className="room-fine">No wallet transaction. This locks test credits on the game server.</p>
      </div>
    </div>
  )
}
