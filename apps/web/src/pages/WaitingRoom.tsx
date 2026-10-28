import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, formatPetc, isTier, type Room, type Tier } from '../api'
import { LobbyFrame } from '../components/LobbyFrame'
import { fighterById, rememberedFighter } from '../fighters'
import { shortAddress, useWallet } from '../wallet'

const TIER_COIN: Record<Tier, string> = {
  10: '/tier-10.png',
  20: '/tier-20.png',
  50: '/tier-50.png',
  100: '/tier-100.png',
  1000: '/tier-1000.png',
}

function remain(deadline: number, now: number): string {
  const left = Math.max(0, deadline - now)
  const seconds = Math.floor(left / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function WaitingRoom() {
  const { roomId } = useParams()
  const [search] = useSearchParams()
  const wallet = useWallet()
  const navigate = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [missing, setMissing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!roomId) return
    try {
      setRoom(await api<Room>(`/rooms/${roomId}`, wallet.token))
      setMissing(false)
    } catch {
      setRoom(null)
      setMissing(true)
    }
  }, [roomId, wallet.token])

  useEffect(() => {
    document.title = 'Room waiting — Pet Fight'
  }, [])

  useEffect(() => {
    void load()
    const poll = window.setInterval(() => void load(), 4000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
    }
  }, [load])

  const fighter = fighterById(roomId ? rememberedFighter(roomId) : 'dog')
  const mine = Boolean(room && wallet.address === room.host)
  const joined = Boolean(room?.guest)
  const tier = room && isTier(room.stakeTier) ? room.stakeTier : null
  const invite = room?.inviteCode
    ? `${window.location.origin}/rooms/${room.id}?invite=${room.inviteCode}`
    : room
      ? `${window.location.origin}/rooms/${room.id}`
      : ''

  async function join() {
    if (!room || busy) return
    let token = wallet.token
    if (!token) {
      wallet.setOpen(true)
      token = await wallet.connectMetaMask()
      if (!token) return
    }
    setBusy(true)
    setNotice(null)
    try {
      const code = search.get('invite')
      await api(`/rooms/${room.id}/join`, token, {
        method: 'POST',
        body: JSON.stringify(code ? { inviteCode: code } : {}),
      })
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not join the room.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!room || busy) return
    if (!wallet.token) return
    setBusy(true)
    setNotice(null)
    try {
      await api(`/rooms/${room.id}/cancel`, wallet.token, { method: 'POST' })
      navigate('/rooms')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not cancel the room.')
      setBusy(false)
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
    } catch {
      setNotice('Could not copy the invite link.')
    }
  }

  return (
    <LobbyFrame>
      <main className="lobby-main">
        {missing || !room || tier === null ? (
          <p className="room-empty">{missing ? 'This room is not on the server. Rooms reset when the game server restarts.' : 'Loading room…'}</p>
        ) : (
          <section className="wait-card">
            <header className="wait-top">
              <img src={TIER_COIN[tier]} alt="" />
              <div>
                <h1>{tier.toLocaleString('en-US')} PETC room</h1>
                <p>
                  {room.visibility === 'public' ? 'Public' : 'Private'} · Room #{room.id.slice(0, 8)} · Best of 3
                </p>
              </div>
              <span>{joined ? '2/2' : '1/2'} players</span>
            </header>

            <div className="wait-vs">
              <div>
                <img src={fighter.src} alt="" />
                <strong>{mine ? 'You' : 'Host'} · {mine ? fighter.name : 'Dog'}</strong>
                <em>{shortAddress(room.host)}</em>
                <b>{room.hostDeposit ? `${tier.toLocaleString('en-US')} PETC locked` : 'Not locked'}</b>
              </div>
              <span>VS</span>
              <div>
                <i />
                <strong>Opponent</strong>
                <em>{room.guest ? shortAddress(room.guest) : 'Not joined yet'}</em>
                <b className={room.guestDeposit ? undefined : 'is-wait'}>{room.guestDeposit ? `${tier.toLocaleString('en-US')} PETC locked` : 'Waiting…'}</b>
              </div>
            </div>

            <ol className="wait-steps">
              <li className="is-done">Room created</li>
              <li className={room.hostDeposit ? 'is-done' : undefined}>
                {tier.toLocaleString('en-US')} PETC locked on the game server
              </li>
              <li className={joined ? 'is-done' : 'is-now'}>
                Opponent joins and locks {tier.toLocaleString('en-US')} PETC
                {joined ? null : <em>Room expires in {remain(room.joinDeadline, now)} if nobody joins</em>}
              </li>
              <li>Both players ready · pot {formatPetc(room.pot)} PETC</li>
            </ol>

            <label className="wait-invite">
              Invite a friend
              <span>
                <input readOnly value={invite} />
                <button type="button" onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy'}</button>
              </span>
            </label>

            {notice ? <p className="lobby-notice">{notice}</p> : null}

            {mine && !joined ? (
              <>
                <button className="wait-refund" type="button" disabled={busy} onClick={() => void cancel()}>
                  Cancel room & refund {tier.toLocaleString('en-US')} PETC
                </button>
                <p>Cancelling is only possible before an opponent locks their entry.</p>
              </>
            ) : null}
            {!mine && !joined && room.status === 'HOST_FUNDED' ? (
              <button className="room-lock" type="button" disabled={busy} onClick={() => void join()}>
                Join & lock {tier.toLocaleString('en-US')} PETC
              </button>
            ) : null}
            {joined ? <p>Both entries are locked. The match screen is next.</p> : null}
          </section>
        )}
      </main>
    </LobbyFrame>
  )
}
