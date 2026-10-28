import { useCallback, useEffect, useState } from 'react'
import { LobbyFrame } from '../components/LobbyFrame'
import { formatUnits, parseUnits, readStake, stakePet, withdrawPet, withdrawPetc, type StakeView } from '../stake'
import { useWallet } from '../wallet'

const EMPTY: StakeView = { pet: 0n, petc: 0n, staked: 0n, reward: 0n, lockedUntil: 0n }

function lockText(until: bigint): string {
  if (until === 0n) return 'Nothing staked'
  const at = Number(until) * 1000
  if (Date.now() >= at) return 'Unlocked'
  return `Locked until ${new Date(at).toLocaleString()}`
}

function sessionAddress(): string | null {
  const raw = sessionStorage.getItem('petfight.session')
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as { address?: string }
    return typeof session.address === 'string' ? session.address : null
  } catch {
    return null
  }
}

export function Practice() {
  const wallet = useWallet()
  const [view, setView] = useState<StakeView>(EMPTY)
  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    document.title = 'Practice — Pet Fight'
  }, [])

  const load = useCallback(async (account: string | null) => {
    if (!account) {
      setView(EMPTY)
      setLoaded(true)
      return
    }
    try {
      setView(await readStake(account))
      setNotice(null)
    } catch {
      setNotice('Could not read the staking vault.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load(wallet.address)
  }, [load, wallet.address])

  async function accountOrConnect(): Promise<string | null> {
    if (wallet.address) return wallet.address
    wallet.setOpen(true)
    const token = await wallet.connectMetaMask()
    if (!token) return null
    return sessionAddress()
  }

  async function onStake() {
    if (busy) return
    const amount = parseUnits(stakeAmount)
    if (amount === null || amount === 0n) {
      setNotice('Enter a $PET amount to stake.')
      return
    }
    const account = await accountOrConnect()
    if (!account) return
    setBusy(true)
    setNotice(null)
    try {
      await stakePet(account, amount)
      setStakeAmount('')
      setNotice('Staked. The 7-day lock starts from this stake.')
      await load(account)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not stake.')
    } finally {
      setBusy(false)
    }
  }

  async function onWithdraw() {
    if (busy) return
    const amount = parseUnits(withdrawAmount)
    if (amount === null || amount === 0n) {
      setNotice('Enter a $PET amount to withdraw.')
      return
    }
    if (view.lockedUntil > 0n && Date.now() < Number(view.lockedUntil) * 1000) {
      setNotice(lockText(view.lockedUntil))
      return
    }
    const account = await accountOrConnect()
    if (!account) return
    setBusy(true)
    setNotice(null)
    try {
      await withdrawPet(account, amount)
      setWithdrawAmount('')
      setNotice('Withdrew $PET.')
      await load(account)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not withdraw $PET.')
    } finally {
      setBusy(false)
    }
  }

  async function onWithdrawPetc() {
    if (busy) return
    if (view.reward === 0n) {
      setNotice('There is no PETC reward to withdraw.')
      return
    }
    const account = await accountOrConnect()
    if (!account) return
    setBusy(true)
    setNotice(null)
    try {
      await withdrawPetc(account)
      setNotice('Withdrew PETC from the reward pool.')
      await load(account)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not withdraw PETC.')
    } finally {
      setBusy(false)
    }
  }

  const locked = view.lockedUntil > 0n && Date.now() < Number(view.lockedUntil) * 1000

  return (
    <LobbyFrame>
      <main className="lobby-main">
        <section className="stake-head">
          <h1>Stake</h1>
          <p>
            Stake $PET. Withdraw sends that $PET back after 7 days. Withdraw PETC takes the reward from the pool:
            0.000001 PETC per 1 $PET per day. PETC is not minted, and it has no cash value.
          </p>
        </section>

        <section className="stake-stats">
          <article>
            <span>Wallet $PET</span>
            <strong>{loaded ? formatUnits(view.pet) : '—'}</strong>
          </article>
          <article>
            <span>Staked $PET</span>
            <strong>{loaded ? formatUnits(view.staked) : '—'}</strong>
          </article>
          <article>
            <span>PETC reward</span>
            <strong>{loaded ? formatUnits(view.reward) : '—'}</strong>
          </article>
          <article>
            <span>Wallet PETC</span>
            <strong>{loaded ? formatUnits(view.petc) : '—'}</strong>
          </article>
        </section>

        <section className="stake-grid">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onStake()
            }}
          >
            <h2>Stake $PET</h2>
            <label>
              Amount
              <input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <button className="lobby-gold" type="submit" disabled={busy}>
              Stake
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onWithdraw()
            }}
          >
            <h2>Withdraw $PET</h2>
            <label>
              Amount
              <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <p>{lockText(view.lockedUntil)}</p>
            <button className="lobby-ghost" type="submit" disabled={busy || locked}>
              Withdraw $PET
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onWithdrawPetc()
            }}
          >
            <h2>Withdraw PETC</h2>
            <p>The game coin ready to take out is {loaded ? formatUnits(view.reward) : '—'} PETC. You can claim it during the lock.</p>
            <button className="lobby-gold" type="submit" disabled={busy || view.reward === 0n}>
              Withdraw PETC
            </button>
          </form>
        </section>

        {notice ? <p className="lobby-notice">{notice}</p> : null}
      </main>
    </LobbyFrame>
  )
}
