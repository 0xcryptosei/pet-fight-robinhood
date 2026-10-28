import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formatPetc, TIERS, tierWei, type Room, type Tier } from '../api'
import { CreatePetDialog } from '../components/CreatePetDialog'
import { CreateRoomDialog } from '../components/CreateRoomDialog'
import { LobbyFrame } from '../components/LobbyFrame'
import { readOwnedPets, signedInAddress } from '../pets'
import { shortAddress, useWallet } from '../wallet'

const TIER_COIN: Record<Tier, string> = {
  10: '/tier-10.png',
  20: '/tier-20.png',
  50: '/tier-50.png',
  100: '/tier-100.png',
  1000: '/tier-1000.png',
}

export function BattleRooms() {
  const wallet = useWallet()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [filter, setFilter] = useState<Tier | 'all'>('all')
  const [available, setAvailable] = useState<bigint | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [petOpen, setPetOpen] = useState(false)
  const [afterPet, setAfterPet] = useState<'create' | Room | null>(null)

  useEffect(() => {
    document.title = 'Battle rooms — Pet Fight'
  }, [])

  const load = useCallback(async () => {
    try {
      setRooms(await api<Room[]>('/rooms', wallet.token))
    } catch {
      setRooms(null)
    }
    if (!wallet.token) {
      setAvailable(null)
      return
    }
    try {
      const balances = await api<{ available: string }>('/me/balances', wallet.token)
      setAvailable(/^\d+$/.test(balances.available) ? BigInt(balances.available) : null)
    } catch {
      setAvailable(null)
    }
  }, [wallet.token])

  useEffect(() => {
    void load()
  }, [load])

  const shown = (rooms ?? []).filter((room) => filter === 'all' || room.stakeTier === filter)

  async function ensurePet(next: 'create' | Room): Promise<boolean> {
    let account = wallet.address ?? signedInAddress()
    if (!wallet.token || !account) {
      wallet.setOpen(true)
      const token = await wallet.connectMetaMask()
      if (!token) return false
      account = signedInAddress()
    }
    if (!account) return false
    let dogs
    try {
      dogs = await readOwnedPets(account)
    } catch {
      setNotice('Could not read pets from the contract.')
      return false
    }
    if (dogs.length > 0) return true
    setAfterPet(next)
    setPetOpen(true)
    return false
  }

  async function joinRoom(room: Room) {
    if (busy) return
    if (!(await ensurePet(room))) return
    let token = wallet.token
    if (!token) {
      wallet.setOpen(true)
      token = await wallet.connectMetaMask()
      if (!token) return
    }
    if (wallet.address === room.host) {
      navigate(`/rooms/${room.id}`)
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await api(`/rooms/${room.id}/join`, token, { method: 'POST', body: '{}' })
      navigate(`/rooms/${room.id}`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not join the room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <LobbyFrame>
      <main className="lobby-main">
        <section className="battle-board">
          <div className="battle-head">
            <div>
              <h1>Battle rooms</h1>
              <p>Join an open room. Your entry is locked when you join.</p>
            </div>
            <button
              className="room-lock"
              type="button"
              onClick={() => {
                void (async () => {
                  if (await ensurePet('create')) setCreateOpen(true)
                })()
              }}
            >
              + Create room
            </button>
          </div>

          <div className="battle-filters">
            <button type="button" className={filter === 'all' ? 'is-on' : undefined} onClick={() => setFilter('all')}>
              All
            </button>
            {TIERS.map((tier) => (
              <button key={tier} type="button" className={filter === tier ? 'is-on' : undefined} aria-label={`${tier.toLocaleString('en-US')} PETC`} onClick={() => setFilter(tier)}>
                <img src={TIER_COIN[tier]} alt="" />
              </button>
            ))}
          </div>

          <div className="battle-table">
            <div className="battle-row battle-labels">
              <span>Room</span>
              <span>Host</span>
              <span>Players</span>
              <span>PETC</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {shown.length === 0 ? (
              <p className="room-empty">{rooms === null ? 'The room list is unavailable.' : 'No open rooms yet.'}</p>
            ) : (
              shown.map((room) => {
                const mine = wallet.address === room.host
                const short = available !== null && available < tierWei(room.stakeTier)
                return (
                  <div className="battle-row" key={room.id}>
                    <span className="battle-room">
                      <img src={TIER_COIN[room.stakeTier]} alt="" />
                      <span>
                        <strong>{room.stakeTier.toLocaleString('en-US')} PETC room</strong>
                        <em>#{room.id.slice(0, 8)} · entry {room.stakeTier.toLocaleString('en-US')}</em>
                      </span>
                    </span>
                    <span className="battle-host">
                      <img src="/faces/dog.png" alt="" />
                      <span>
                        <strong>{shortAddress(room.host)}</strong>
                        <em>Dog</em>
                      </span>
                    </span>
                    <span>1/2</span>
                    <span className="battle-pot">{formatPetc(room.pot)}</span>
                    <span className="room-wait">Waiting</span>
                    <span>
                      {mine ? (
                        <button type="button" onClick={() => navigate(`/rooms/${room.id}`)}>
                          Your room
                        </button>
                      ) : (
                        <button type="button" disabled={busy || short} onClick={() => void joinRoom(room)}>
                          {short ? 'Need PETC' : 'Join'}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          <p className="battle-foot">Open rooms are waiting for one more player. A room leaves this list once someone joins.</p>
          {notice ? <p className="lobby-notice">{notice}</p> : null}
        </section>
      </main>
      <CreateRoomDialog open={createOpen} initialTier={filter === 'all' ? 20 : filter} onClose={() => setCreateOpen(false)} />
      <CreatePetDialog
        open={petOpen}
        onClose={() => {
          setPetOpen(false)
          setAfterPet(null)
        }}
        onCreated={() => {
          const next = afterPet
          setPetOpen(false)
          setAfterPet(null)
          setNotice('Created your pet. The contract sent 100 PETC to this wallet.')
          if (next === 'create') setCreateOpen(true)
          else if (next) void joinRoom(next)
        }}
      />
    </LobbyFrame>
  )
}
