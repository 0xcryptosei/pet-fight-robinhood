import { useCallback, useEffect, useState } from 'react'
import { LobbyFrame } from '../components/LobbyFrame'
import { CLOTH_HP, FOOD_HP, HAT_PWR, SHOES_PWR, UPGRADE_HP, UPGRADE_PWR, gearStats, mintDog, readOwnedPets, signedInAddress, type OwnedPet } from '../pets'
import { ITEM_PETC, UPGRADE_PETC, buyItem, buyUpgrade, notifyPetc, readGear, type Gear } from '../stake'
import { useWallet } from '../wallet'
import hat from '../../assets/pet-fight-vector-assets/svg/08-upgrade/items/pet-hat.svg'
import cloth from '../../assets/pet-fight-vector-assets/svg/08-upgrade/items/pet-cloth.svg'
import shoes from '../../assets/pet-fight-vector-assets/svg/08-upgrade/items/pet-shoes.svg'
import food from '../../assets/pet-fight-vector-assets/svg/08-upgrade/items/pet-food.svg'
import hpIcon from '../../assets/pet-fight-vector-assets/svg/07-pets/stats/stat-hp.svg'
import pwrIcon from '../../assets/pet-fight-vector-assets/svg/07-pets/stats/stat-pwr.svg'

const ITEMS = [
  { name: 'Hat', src: hat, price: ITEM_PETC, kind: 0, bonus: `Power +${HAT_PWR}`, bundle: 1, owned: (gear: Gear) => gear.hat },
  { name: 'Cloth', src: cloth, price: ITEM_PETC, kind: 1, bonus: `HP +${CLOTH_HP}`, bundle: 1, owned: (gear: Gear) => gear.cloth },
  { name: 'Shoes', src: shoes, price: ITEM_PETC, kind: 2, bonus: `Power +${SHOES_PWR}`, bundle: 1, owned: (gear: Gear) => gear.shoes },
  { name: 'Food', src: food, price: ITEM_PETC, kind: 3, bonus: `HP +${FOOD_HP}`, bundle: 3, owned: (gear: Gear) => gear.food },
]

function DogCard({
  level,
  gear,
  busy,
  onBuy,
  onUpgrade,
}: {
  level: number
  gear: Gear
  busy: boolean
  onBuy: (kind: number) => void
  onUpgrade: () => void
}) {
  const now = gearStats(gear, level)

  return (
    <article className="pet-card">
      <header className="pet-profile">
        <img src="/faces/dog.png" alt="" />
        <div>
          <p className="pet-kicker">Your dog</p>
          <h2>Dog</h2>
          <p className="pet-level">
            Level {level}
            <span>Next {level + 1}</span>
          </p>
        </div>
        <div className="pet-statline">
          <article>
            <img src={hpIcon} alt="" />
            <div>
              <span>Health</span>
              <strong>{now.hp}</strong>
              <em>+{UPGRADE_HP} on upgrade</em>
            </div>
          </article>
          <article>
            <img src={pwrIcon} alt="" />
            <div>
              <span>Power</span>
              <strong>{now.pwr}</strong>
              <em>+{UPGRADE_PWR} on upgrade</em>
            </div>
          </article>
        </div>
      </header>

      <section>
        <div className="pet-section">
          <h3>Gear</h3>
          <p>Each buy is saved on this dog.</p>
        </div>
        <div className="pet-items">
          {ITEMS.map((item) => {
            const owned = item.owned(gear)
            return (
              <button key={item.name} type="button" disabled={busy} onClick={() => onBuy(item.kind)}>
                <img src={item.src} alt="" />
                <strong>{item.name}</strong>
                <span className={owned > 0 ? 'is-owned' : undefined}>Owned {owned}</span>
                <em>{item.bonus}</em>
                <small>{item.price.toString()} PETC</small>
              </button>
            )
          })}
        </div>
      </section>

      <footer className="pet-upgrade">
        <div>
          <p className="pet-kicker">Upgrade</p>
          <h3>
            Level {level} <span>→</span> Level {level + 1}
          </h3>
          <div className="pet-gains">
            <span>
              <img src={hpIcon} alt="" />
              HP +{UPGRADE_HP}
            </span>
            <span>
              <img src={pwrIcon} alt="" />
              Power +{UPGRADE_PWR}
            </span>
          </div>
          <ul className="pet-bundle">
            {ITEMS.map((item) => (
              <li key={item.name}>
                <img src={item.src} alt="" />
                <span>{item.name}</span>
                <b>×{item.bundle}</b>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" disabled={busy} onClick={onUpgrade}>
          Upgrade · {UPGRADE_PETC.toString()} PETC
        </button>
      </footer>
    </article>
  )
}

export function Pets() {
  const wallet = useWallet()
  const [pets, setPets] = useState<OwnedPet[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gearById, setGearById] = useState<Record<string, Gear>>({})

  useEffect(() => {
    document.title = 'Pets — Pet Fight'
  }, [])

  const load = useCallback(async (account: string | null) => {
    if (!account) {
      setPets([])
      setGearById({})
      return
    }
    try {
      const owned = await readOwnedPets(account)
      const entries = await Promise.all(owned.map(async (pet) => [pet.tokenId, await readGear(pet.tokenId)] as const))
      setPets(owned)
      setGearById(Object.fromEntries(entries))
    } catch {
      setPets(null)
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
          <h1>Pet management</h1>
          <p>Cloth and Food raise Health. Hat and Shoes raise Power.</p>
        </header>

        {notice ? <p className="lobby-notice">{notice}</p> : null}

        {wallet.address && pets === null ? <p className="room-empty">Could not read this wallet’s pets.</p> : null}

        <section className="pet-grid">
          {(pets ?? []).map((pet) => {
            const gear = gearById[pet.tokenId] ?? { hat: 0, cloth: 0, shoes: 0, food: 0, level: 0 }
            const level = gear.level > 0 ? gear.level : 1
            const pay = async (action: (account: string) => Promise<void>, done: string) => {
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
                await action(account)
                notifyPetc()
                setNotice(done)
                await load(account)
              } catch (caught) {
                setNotice(caught instanceof Error ? caught.message : 'Could not save the dog.')
              } finally {
                setBusy(false)
              }
            }
            return (
              <DogCard
                key={pet.tokenId}
                level={level}
                gear={gear}
                busy={busy}
                onBuy={(kind) => {
                  const item = ITEMS.find((entry) => entry.kind === kind)
                  const next = gearStats(
                    {
                      hat: gear.hat + (kind === 0 ? 1 : 0),
                      cloth: gear.cloth + (kind === 1 ? 1 : 0),
                      shoes: gear.shoes + (kind === 2 ? 1 : 0),
                      food: gear.food + (kind === 3 ? 1 : 0),
                    },
                    level,
                  )
                  void pay(
                    (account) => buyItem(account, pet.tokenId, kind),
                    `Bought ${item?.name ?? 'the item'}. This dog is now HP ${next.hp}, Power ${next.pwr}.`,
                  )
                }}
                onUpgrade={() => {
                  const next = gearStats(
                    { hat: gear.hat + 1, cloth: gear.cloth + 1, shoes: gear.shoes + 1, food: gear.food + 3 },
                    level + 1,
                  )
                  void pay(
                    (account) => buyUpgrade(account, pet.tokenId),
                    `Upgraded your dog. This dog is now HP ${next.hp}, Power ${next.pwr}.`,
                  )
                }}
              />
            )
          })}

          {pets !== null && pets.length === 0 ? (
            <article className="pet-card pet-empty">
              <img src="/faces/dog.png" alt="" />
              <div>
                <p className="pet-kicker">No pet yet</p>
                <h2>Create your dog</h2>
                <p>A wallet starts with no pet. Creating one mints a dog NFT and sends 100 PETC to this wallet. It starts at Health 100 and Power 70.</p>
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
              </div>
            </article>
          ) : null}
        </section>
      </main>
    </LobbyFrame>
  )
}
