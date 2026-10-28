import { useCallback, useEffect, useState } from 'react'
import { LobbyFrame } from '../components/LobbyFrame'
import { formatPetc } from '../api'
import { dogStats, mintDog, readOwnedPets, savedLevel, saveUpgrade, signedInAddress, type OwnedPet } from '../pets'
import { notifyPetc, readPetcBalance } from '../stake'
import { useWallet } from '../wallet'

export function Pets() {
  const wallet = useWallet()
  const [pets, setPets] = useState<OwnedPet[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [petc, setPetc] = useState<bigint | null>(null)

  useEffect(() => {
    document.title = 'Pets — Pet Fight'
  }, [])

  const load = useCallback(async (account: string | null) => {
    if (!account) {
      setPets([])
      setPetc(null)
      return
    }
    try {
      const [owned, balance] = await Promise.all([readOwnedPets(account), readPetcBalance(account)])
      setPets(owned)
      setPetc(balance)
    } catch {
      setPets(null)
      setPetc(null)
      setNotice('Could not read pets from the contract.')
    }
  }, [])

  useEffect(() => {
    void load(wallet.address)
  }, [load, wallet.address])

  return (
    <LobbyFrame>
      <main className="lobby-main">
        <header className="pet-head">
          <div>
            <h1>Pet management</h1>
            <p>
              {pets === null
                ? '—'
                : pets.length === 0
                  ? `No pet yet · ${petc === null ? '—' : formatPetc(petc.toString())} PETC. Create a pet to receive 100 PETC.`
                  : `${pets.length} ${pets.length === 1 ? 'dog' : 'dogs'} · ${petc === null ? '—' : formatPetc(petc.toString())} PETC`}
            </p>
          </div>
          <div className="pet-tabs">
            <button type="button" className="is-on">My pets</button>
            <button type="button" onClick={() => setNotice('Equipment does not change stats in this version.')}>Equipment</button>
            <button type="button" onClick={() => setNotice('Inventory is not available in this beta.')}>Inventory</button>
          </div>
        </header>

        {notice ? <p className="lobby-notice">{notice}</p> : null}

        {wallet.address && pets === null ? <p className="room-empty">Could not read this wallet’s pets.</p> : null}

        <section className="pet-grid">
          {(pets ?? []).map((pet) => {
            const level = wallet.address ? savedLevel(wallet.address, pet.tokenId, pet.level) : pet.level
            const stats = dogStats(level)
            void revision
            return (
              <article className="pet-card" key={pet.tokenId}>
                <header>
                  <img src="/faces/dog.png" alt="" />
                  <div>
                    <strong>Dog</strong>
                    <span>Level {level}</span>
                    <em>Token #{pet.tokenId}</em>
                  </div>
                </header>
                <dl>
                  <div><dt>HP</dt><dd>{stats.hp}</dd></div>
                  <div><dt>PWR</dt><dd>{stats.pwr}</dd></div>
                  <div><dt>INT</dt><dd>{stats.int}</dd></div>
                </dl>
                {openId === pet.tokenId ? (
                  <p>Every dog starts at HP 100, Power 70, INT 50. Only you can upgrade this dog. Each level adds 10% of those base stats.</p>
                ) : null}
                <footer>
                  <button type="button" onClick={() => setOpenId(openId === pet.tokenId ? null : pet.tokenId)}>Details</button>
                  <button
                    type="button"
                    className="is-upgrade"
                    onClick={() => {
                      if (!wallet.address) return
                      const next = level + 1
                      saveUpgrade(wallet.address, pet.tokenId, next)
                      setRevision((value) => value + 1)
                      setNotice(`Upgraded your dog to level ${next}.`)
                    }}
                  >
                    Upgrade
                  </button>
                </footer>
              </article>
            )
          })}

          {pets !== null && pets.length === 0 ? (
            <article className="pet-new">
              <img src="/faces/dog.png" alt="" />
              <strong>Create pet</strong>
              <p>You start with no pet. Create one to battle. That mints one dog NFT, and the contract sends 100 PETC to this wallet. Every dog starts at HP 100, Power 70, INT 50.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    let account = wallet.address ?? signedInAddress()
                    if (!account) {
                      wallet.setOpen(true)
                      const token = await wallet.connectMetaMask()
                      if (!token) return
                      account = signedInAddress()
                    }
                    if (!account) return
                    setBusy(true)
                    setNotice(null)
                    try {
                      await mintDog(account)
                      setNotice('Created your pet. The contract sent 100 PETC to this wallet.')
                      notifyPetc()
                      await load(account)
                    } catch (caught) {
                      setNotice(caught instanceof Error ? caught.message : 'Could not mint the dog.')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                Create pet
              </button>
            </article>
          ) : null}
        </section>
      </main>
    </LobbyFrame>
  )
}
