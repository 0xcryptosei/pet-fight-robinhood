import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, formatPetc, isTier, type Tier } from '../api'
import { useWallet } from '../wallet'
import bone from '../../assets/pet-fight-vector-assets/svg/09-battle/projectiles/bone.svg'
import fishBone from '../../assets/pet-fight-vector-assets/svg/09-battle/projectiles/fish-bone.svg'

type FighterView = {
  health: number
  maxHealth: number
  energy: number
}

type HitView = {
  zone: string
  damage: number
  contactX: number
  contactY: number
}

type ActionView = {
  type: string
  power?: number
  angle?: number
}

type ActionEvent = {
  kind: string
  player?: 0 | 1
  hits?: HitView[]
  action?: ActionView
}

type MatchView = {
  roundSlot: number
  wind: number
  p1Rounds: number
  p2Rounds: number
  status: string
  outcome: string
  active: 0 | 1
  fighters: [FighterView, FighterView]
  events: ActionEvent[]
}

type Flight = {
  id: number
  src: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  peak: number
}

type BattleRoom = {
  id: string
  host: string
  guest: string | null
  stakeTier: number
  pot: string
  status: string
  outcome: string | null
  winner: string | null
  turn: { active: string; paused: boolean; deadlineAt: number | null } | null
}

function randomSeed(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function throwEvents(match: MatchView): ActionEvent[] {
  return match.events.filter((event) => event.kind === 'action' && event.action && event.action.type !== 'heal' && event.action.type !== 'pass')
}

function flightFrom(event: ActionEvent, hit: HitView | undefined, index: number): Flight {
  const player = event.player === 1 ? 1 : 0
  const degrees = (event.action?.angle ?? 45000) / 1000
  const dog = player === 0
  const landed = hit && hit.zone !== 'miss'
  const mirrored = Math.max(6, Math.min(94, 100 - (hit?.contactX ?? 6000) / 120))
  const toX = landed ? (dog ? 18 : 82) : mirrored
  return {
    id: index,
    src: dog ? bone : fishBone,
    fromX: dog ? 82 : 18,
    fromY: 28,
    toX,
    toY: landed ? (hit.zone === 'head' ? 40 : 26) : 12,
    peak: 8 + (degrees / 90) * 24,
  }
}

function previewFlight(player: 0 | 1, degrees: number, shotPower: number): Flight {
  const dog = player === 0
  const reach = 14 + (shotPower / 100) * 56
  return {
    id: Date.now(),
    src: dog ? bone : fishBone,
    fromX: dog ? 82 : 18,
    fromY: 22,
    toX: dog ? Math.max(18, 82 - reach) : Math.min(82, 18 + reach),
    toY: 18,
    peak: 10 + (degrees / 90) * 22,
  }
}

function latestShot(match: MatchView | null): string | null {
  if (!match) return null
  for (let index = match.events.length - 1; index >= 0; index -= 1) {
    const event = match.events[index]
    if (event.kind !== 'action' || !event.action) continue
    if (event.action.type === 'heal') return 'Heal'
    if (event.action.type === 'pass') return 'Pass'
    const hit = event.hits?.find((entry) => entry.damage > 0)
    return hit ? `${hit.zone} · ${hit.damage}` : 'Miss'
  }
  return null
}

export function Battle() {
  const { roomId } = useParams()
  const wallet = useWallet()
  const navigate = useNavigate()
  const [room, setRoom] = useState<BattleRoom | null>(null)
  const [match, setMatch] = useState<MatchView | null>(null)
  const [yourTurn, setYourTurn] = useState(false)
  const [count, setCount] = useState<number | null>(3)
  const [notice, setNotice] = useState<string | null>(null)
  const [angle, setAngle] = useState(45)
  const [power, setPower] = useState(1)
  const [holding, setHolding] = useState(false)
  const [now, setNow] = useState(Date.now())
  const socketRef = useRef<WebSocket | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const readied = useRef(false)
  const seenThrows = useRef<number | null>(null)
  const localShots = useRef(0)
  const holdingRef = useRef(false)
  const dirRef = useRef(1)
  const aimRef = useRef({ angle: 45, power: 1 })
  const [flights, setFlights] = useState<Flight[]>([])

  useEffect(() => {
    document.title = 'Battle — Pet Fight'
  }, [])

  useEffect(() => {
    if (!roomId) return
    void api<BattleRoom>(`/rooms/${roomId}`, wallet.token)
      .then((next) => {
        setRoom(next)
        if (next.status === 'IN_PROGRESS' || next.status === 'SETTLED' || next.status === 'EXPIRED') setCount(null)
      })
      .catch(() => setNotice('This room is not on the server.'))
  }, [roomId, wallet.token])

  useEffect(() => {
    if (count === null) return
    const timer = window.setTimeout(() => setCount(count === 1 ? null : count - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [count])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!roomId || !wallet.token) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(wallet.token)}`)
    socketRef.current = socket
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'battle:sync', roomId }))
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        type?: string
        room?: BattleRoom
        match?: MatchView | null
        yourTurn?: boolean
        message?: string
      }
      if (message.type === 'battle:state' && message.room) {
        setRoom(message.room)
        setMatch(message.match ?? null)
        setYourTurn(Boolean(message.yourTurn))
      } else if (message.type === 'error' && message.message) {
        setNotice(message.message)
      }
    }
    return () => {
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [roomId, wallet.token])

  useEffect(() => {
    if (count !== null || !roomId || !wallet.token || !room || room.status !== 'READY' || readied.current) return
    const me = wallet.address?.toLowerCase()
    if (!me || (me !== room.host.toLowerCase() && me !== room.guest?.toLowerCase())) return
    readied.current = true
    void api(`/rooms/${roomId}/ready`, wallet.token, {
      method: 'POST',
      body: JSON.stringify({ clientSeed: randomSeed() }),
    })
      .then(() => {
        const socket = socketRef.current
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'battle:sync', roomId }))
        }
      })
      .catch((caught: unknown) => {
        readied.current = false
        setNotice(caught instanceof Error ? caught.message : 'Could not start the battle.')
      })
  }, [count, room, roomId, wallet.address, wallet.token])

  useEffect(() => {
    if (!match) return
    const throws = throwEvents(match)
    if (seenThrows.current === null) {
      seenThrows.current = throws.length
      return
    }
    if (throws.length <= seenThrows.current) return
    const shooter = room && wallet.address && room.host.toLowerCase() === wallet.address.toLowerCase() ? 0 : 1
    const fresh = throws.slice(seenThrows.current).filter((event) => {
      if (localShots.current > 0 && event.player === shooter) {
        localShots.current -= 1
        return false
      }
      return true
    })
    seenThrows.current = throws.length
    fresh.forEach((event, eventIndex) => {
      const hits = event.hits?.length ? event.hits : [undefined]
      hits.forEach((hit, hitIndex) => {
        const flight = flightFrom(event, hit, Date.now() + eventIndex * 10 + hitIndex)
        window.setTimeout(() => {
          setFlights((current) => [...current, flight])
        }, hitIndex * 180)
      })
    })
  }, [match, room, wallet.address])

  function sendAction(action: { type: 'normal'; power: number; angle: number } | { type: 'heal' } | { type: 'pass' }) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomId) return
    socket.send(
      JSON.stringify({
        type: 'battle:action',
        roomId,
        actionId: randomSeed(),
        action,
      }),
    )
  }

  const me = wallet.address?.toLowerCase()
  const playing = Boolean(room && me && (me === room.host.toLowerCase() || me === room.guest?.toLowerCase()))
  const mine = room && me === room.host.toLowerCase() ? 0 : 1
  const dog = match?.fighters[0]
  const cat = match?.fighters[1]
  const energy = match ? match.fighters[mine].energy : 100
  const dogTurn = (match?.active ?? 0) === 0
  const catHealth = percent(cat, 80)
  const dogHealth = percent(dog, 100)
  const seconds = room?.turn?.deadlineAt ? Math.max(0, Math.ceil((room.turn.deadlineAt - now) / 1000)) : null
  const finished = room?.status === 'SETTLED' || room?.status === 'EXPIRED'
  const won = Boolean(finished && room?.winner && me && room.winner.toLowerCase() === me)
  const draw = finished && room?.outcome === 'draw'
  const tier = room && isTier(room.stakeTier) ? (room.stakeTier as Tier) : null
  const shot = latestShot(match)
  const canThrow = Boolean(playing && yourTurn && !finished && count === null && match)
  const aimSide = mine === 0 ? 'right' : 'left'

  useEffect(() => {
    if (!holding) return
    let frame = 0
    let last = performance.now()
    const tick = (time: number) => {
      const dt = Math.min(32, time - last)
      last = time
      setPower((current) => {
        let next = current + dirRef.current * dt * 0.085
        if (next >= 100) {
          next = 100
          dirRef.current = -1
        } else if (next <= 1) {
          next = 1
          dirRef.current = 1
        }
        const rounded = Math.round(next)
        aimRef.current.power = rounded
        return rounded
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [holding])

  function trackAim(event: React.PointerEvent<HTMLDivElement>) {
    if (!canThrow) return
    const field = fieldRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    const originX = aimSide === 'left' ? rect.left + rect.width * 0.16 : rect.left + rect.width * 0.84
    const originY = rect.top + rect.height * 0.72
    const dx = event.clientX - originX
    const dy = originY - event.clientY
    const toward = aimSide === 'left' ? dx : -dx
    const degrees = (Math.atan2(dy, Math.max(toward, 0.001)) * 180) / Math.PI
    const next = Math.max(0, Math.min(90, Math.round(degrees)))
    aimRef.current.angle = next
    setAngle(next)
  }

  function pressAim(event: React.PointerEvent<HTMLDivElement>) {
    if (!canThrow) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    trackAim(event)
    holdingRef.current = true
    dirRef.current = 1
    aimRef.current.power = 1
    setPower(1)
    setHolding(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function releaseAim() {
    if (!holdingRef.current) return
    holdingRef.current = false
    setHolding(false)
    if (!canThrow) return
    const shotPower = Math.max(1, aimRef.current.power)
    const shotAngle = aimRef.current.angle
    const player = mine === 0 ? 0 : 1
    localShots.current += 1
    setFlights((current) => [...current, previewFlight(player, shotAngle, shotPower)])
    sendAction({ type: 'normal', power: shotPower * 10, angle: shotAngle * 1000 })
  }

  return (
    <section className={`fight${canThrow ? ' is-aiming' : ''}`}>
      <header className="fight-hud">
        <div className="fight-side is-cat">
          <img src="/faces/cat.png" alt="" />
          <div>
            <span>Cat</span>
            <i>
              <b style={{ width: `${catHealth}%` }} />
            </i>
          </div>
        </div>
        <div className="fight-vs">
          <img src="/faces/cat.png" alt="" />
          <strong>VS</strong>
          <img src="/faces/dog.png" alt="" />
          <em>
            {match?.p2Rounds ?? 0} – {match?.p1Rounds ?? 0}
          </em>
        </div>
        <div className="fight-side is-dog">
          <div>
            <span>Dog</span>
            <i>
              <b style={{ width: `${dogHealth}%` }} />
            </i>
          </div>
          <img src="/faces/dog.png" alt="" />
        </div>
      </header>

      <div className="fight-mid">
        <p className={`fight-wind is-${match && match.wind < 0 ? 'left' : 'right'}`}>
          Wind {match ? Math.abs(match.wind / 1000).toFixed(1) : '—'}
        </p>
        <div className="fight-meter">
          <span>Power {power}</span>
          <i style={{ width: `${power}%` }} />
        </div>
        {canThrow ? <p className="fight-hint">Hold to charge · release to throw · {angle}°</p> : null}
        {seconds !== null ? <p className="fight-clock">{seconds}s</p> : null}
      </div>

      <div className="fight-field" ref={fieldRef} onPointerDown={pressAim} onPointerMove={trackAim} onPointerUp={releaseAim} onPointerCancel={releaseAim}>
        {canThrow ? <AimArc side={aimSide} angle={angle} /> : null}
        {match && !finished ? <p className={`fight-turn is-${dogTurn ? 'dog' : 'cat'}`}>{dogTurn ? "Dog's turn!" : "Cat's turn!"}</p> : null}
        {flights.map((flight) => (
          <Projectile key={flight.id} flight={flight} onDone={() => setFlights((current) => current.filter((item) => item.id !== flight.id))} />
        ))}
        {shot ? <p className="fight-shot">{shot}</p> : null}
        {playing && !finished ? (
          <div className="fight-extra">
            <button type="button" disabled={!yourTurn || energy < 40} onClick={() => sendAction({ type: 'heal' })}>
              Heal
            </button>
            <button type="button" disabled={!yourTurn} onClick={() => sendAction({ type: 'pass' })}>
              Pass
            </button>
          </div>
        ) : null}
      </div>

      {count !== null ? (
        <div className="fight-cover">
          <p>Battle starts</p>
          <strong>{count}</strong>
        </div>
      ) : null}

      {finished ? (
        <div className="fight-cover">
          <p>{draw ? 'Draw' : won ? 'You won' : 'You lost'}</p>
          <strong>{tier ? `${formatPetc(room?.pot)} PETC` : 'Match over'}</strong>
          <button type="button" onClick={() => navigate('/rooms')}>
            Back to rooms
          </button>
        </div>
      ) : null}

      {!wallet.token ? (
        <div className="fight-cover">
          <p>Sign in to enter this battle.</p>
          <button
            type="button"
            onClick={() => {
              wallet.setOpen(true)
              void wallet.connectMetaMask()
            }}
          >
            Connect
          </button>
        </div>
      ) : null}

      {notice ? <p className="fight-notice">{notice}</p> : null}
    </section>
  )
}

function percent(fighter: FighterView | undefined, fallback: number): number {
  const health = fighter?.health ?? fallback
  const max = fighter?.maxHealth || fallback
  return Math.max(0, Math.min(100, (health / max) * 100))
}

function AimArc({ side, angle }: { side: 'left' | 'right'; angle: number }) {
  const rad = (angle * Math.PI) / 180
  const dir = side === 'left' ? 1 : -1
  const x1 = side === 'left' ? 16 : 84
  const y1 = 86
  const x2 = x1 + Math.cos(rad) * 64 * dir
  const y2 = y1 - Math.sin(rad) * 64
  const cx = x1 + Math.cos(rad) * 36 * dir
  const cy = y1 - Math.sin(rad) * 42
  return (
    <svg className={`fight-aim is-${side}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="aim-rainbow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff3b30" />
          <stop offset="35%" stopColor="#ffcc00" />
          <stop offset="70%" stopColor="#34c759" />
          <stop offset="100%" stopColor="#0a84ff" />
        </linearGradient>
      </defs>
      <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="url(#aim-rainbow)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

function Projectile({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const started = performance.now()
    let frame = 0
    const step = (now: number) => {
      const next = Math.min(1, (now - started) / 700)
      setProgress(next)
      if (next < 1) frame = requestAnimationFrame(step)
      else done.current()
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [flight.id])
  const x = flight.fromX + (flight.toX - flight.fromX) * progress
  const y = flight.fromY + (flight.toY - flight.fromY) * progress + Math.sin(progress * Math.PI) * flight.peak
  return <img className="fight-projectile" src={flight.src} alt="" style={{ left: `${x}%`, bottom: `${y}%`, transform: `rotate(${progress * 360}deg)` }} />
}
