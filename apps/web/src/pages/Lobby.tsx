import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formatPetc, TIERS, type Room, type Tier } from '../api'
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

export function Lobby() {
  const wallet = useWallet()
  const navigate = useNavigate()
  const [tier, setTier] = useState<Tier>(20)
  const [allRooms, setAllRooms] = useState(false)
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [petOpen, setPetOpen] = useState(false)
  const [afterPet, setAfterPet] = useState<'create' | string | null>(null)

  useEffect(() => {
    document.title = 'Home — Pet Fight'
  }, [])

  const load = useCallback(async () => {
    try {
      const listed = await api<Room[]>('/rooms', wallet.token)
      setRooms(listed)
    } catch {
      setRooms(null)
    }
  }, [wallet.token])

  useEffect(() => {
    void load()
  }, [load])

  const shown = (rooms ?? []).filter((room) => allRooms || room.stakeTier === tier)
  const openCount = (value: Tier) => (rooms ? rooms.filter((room) => room.stakeTier === value).length : null)

  async function ensurePet(next: 'create' | string): Promise<boolean> {
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

  async function joinRoom(id: string) {
    if (busy) return
    if (!(await ensurePet(id))) return
    if (!wallet.token) {
      wallet.setOpen(true)
      await wallet.connectMetaMask()
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await api(`/rooms/${id}/join`, wallet.token, { method: 'POST', body: '{}' })
      navigate(`/rooms/${id}`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not join the room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <LobbyFrame>
      <main className="lobby-main">
        <section className="lobby-banner">
          <div>
            <h1>Ready for battle?</h1>
            <p>Create a room or join one. Win 2 of 3 rounds to take the PETC.</p>
            <div className="lobby-actions">
              <button
                className="lobby-gold"
                type="button"
                onClick={() => {
                  void (async () => {
                    if (await ensurePet('create')) setCreateOpen(true)
                  })()
                }}
              >
                Create room
              </button>
              <button className="lobby-ghost" type="button" onClick={() => navigate('/practice')}>
                Practice
              </button>
            </div>
          </div>
          <div className="lobby-faces" aria-hidden="true">
            <img src="/faces/dog.png" alt="" />
          </div>
        </section>

        {notice ? <p className="lobby-notice">{notice}</p> : null}

        <section className="lobby-tiers">
          <div className="lobby-section-head">
            <h2>Choose a stake tier</h2>
            <p>Both players lock the same entry · No platform fee</p>
          </div>
          <div className="tier-row">
            {TIERS.map((value) => {
              const count = openCount(value)
              return (
                <button
                  key={value}
                  type="button"
                  className={value === tier && !allRooms ? 'is-on' : undefined}
                  onClick={() => {
                    setTier(value)
                    setAllRooms(false)
                  }}
                >
                  <img className="tier-coin" src={TIER_COIN[value]} alt={`${value.toLocaleString('en-US')} PETC`} />
                  <span>
                    {value * 2} PETC · win +{value.toLocaleString('en-US')}
                  </span>
                  <em>{count === null ? '— open rooms' : `${count} open ${count === 1 ? 'room' : 'rooms'}`}</em>
                </button>
              )
            })}
          </div>
        </section>

        <section className="lobby-rooms">
          <div className="lobby-section-head">
            <h2>{allRooms ? 'Open rooms' : `Open rooms · ${tier.toLocaleString('en-US')} PETC`}</h2>
            <button type="button" onClick={() => setAllRooms(true)}>
              See all rooms
            </button>
          </div>
          <div className="room-table">
            <div className="room-head">
              <span>Host</span>
              <span>Pet</span>
              <span>PETC</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {shown.length === 0 ? (
              <p className="room-empty">{rooms === null ? 'The room list is unavailable.' : 'No open rooms yet.'}</p>
            ) : (
              shown.map((room) => (
                <div className="room-row" key={room.id}>
                  <span className="room-host">
                    <img src="/faces/dog.png" alt="" />
                    {shortAddress(room.host)}
                  </span>
                  <span>Dog</span>
                  <span className="room-stake">
                    <img src={TIER_COIN[room.stakeTier]} alt="" />
                    {formatPetc(room.pot)}
                  </span>
                  <span className="room-wait">Waiting · 1/2</span>
                  <span>
                    {wallet.address === room.host ? (
                      <button type="button" onClick={() => navigate(`/rooms/${room.id}`)}>
                        Your room
                      </button>
                    ) : (
                      <button type="button" onClick={() => void joinRoom(room.id)} disabled={busy}>
                        Join
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
      <CreateRoomDialog open={createOpen} initialTier={tier} onClose={() => setCreateOpen(false)} />
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
