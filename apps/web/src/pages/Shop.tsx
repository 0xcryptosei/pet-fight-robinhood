import { useCallback, useEffect, useState } from 'react'
import { LobbyFrame } from '../components/LobbyFrame'
import { buyPetc, formatUnits, notifyPetc, parseUnits, petcForEth, readPetcBalance, readShopStock } from '../stake'
import { useWallet } from '../wallet'

const AMOUNTS = ['0.001', '0.01', '0.1', '1']

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

export function Shop() {
  const wallet = useWallet()
  const [eth, setEth] = useState('0.01')
  const [stock, setStock] = useState<bigint | null>(null)
  const [petc, setPetc] = useState<bigint | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Shop — Pet Fight'
  }, [])

  const load = useCallback(async (account: string | null) => {
    try {
      const [left, balance] = await Promise.all([readShopStock(), account ? readPetcBalance(account) : Promise.resolve(null)])
      setStock(left)
      setPetc(balance)
    } catch {
      setStock(null)
      setNotice('Could not read the shop.')
    }
  }, [])

  useEffect(() => {
    void load(wallet.address)
  }, [load, wallet.address])

  const wei = parseUnits(eth)
  const receive = wei === null ? null : petcForEth(wei)
  const short = receive !== null && stock !== null && receive > stock

  async function onBuy() {
    if (busy) return
    if (wei === null || wei === 0n) {
      setNotice('Enter a test ETH amount.')
      return
    }
    if (short) {
      setNotice('The shop does not have that much PETC left.')
      return
    }
    let account = wallet.address ?? sessionAddress()
    if (!account) {
      wallet.setOpen(true)
      const token = await wallet.connectMetaMask()
      if (!token) return
      account = sessionAddress()
    }
    if (!account) return
    setBusy(true)
    setNotice(null)
    try {
      await buyPetc(account, wei)
      notifyPetc()
      setNotice(`Bought ${formatUnits(petcForEth(wei))} PETC.`)
      await load(account)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not buy PETC.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <LobbyFrame>
      <main className="lobby-main">
        <section className="stake-head">
          <h1>Shop</h1>
          <p>Buy PETC with test ETH. The rate is 10,000 PETC per 1 test ETH. There is no sell-back, and PETC has no cash value.</p>
        </section>

        <section className="stake-stats shop-stats">
          <article>
            <span>For sale</span>
            <strong>{stock === null ? '—' : `${formatUnits(stock)} PETC`}</strong>
          </article>
          <article>
            <span>Your PETC</span>
            <strong>{petc === null ? '—' : formatUnits(petc)}</strong>
          </article>
          <article>
            <span>PETC per 1 test ETH</span>
            <strong>10,000</strong>
          </article>
        </section>

        <section className="stake-grid shop-buy">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onBuy()
            }}
          >
            <h2>Buy PETC</h2>
            <div className="shop-amounts">
              {AMOUNTS.map((amount) => (
                <button key={amount} type="button" className={eth === amount ? 'is-on' : undefined} onClick={() => setEth(amount)}>
                  {amount} ETH
                </button>
              ))}
            </div>
            <label>
              Test ETH
              <input value={eth} onChange={(event) => setEth(event.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <p>
              {receive === null
                ? 'Enter an amount to see the PETC you receive.'
                : short
                  ? `The shop has ${stock === null ? '—' : formatUnits(stock)} PETC left.`
                  : `You receive ${formatUnits(receive)} PETC.`}
            </p>
            <button className="lobby-gold" type="submit" disabled={busy || receive === null || receive === 0n || short}>
              Buy PETC
            </button>
          </form>
        </section>

        {notice ? <p className="lobby-notice">{notice}</p> : null}
      </main>
    </LobbyFrame>
  )
}
