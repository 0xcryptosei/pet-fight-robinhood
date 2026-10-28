import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AimIcon, GrowIcon, InfoIcon, LockIcon, ShieldIcon } from '../components/Icons'

const features = [
  {
    title: 'Own your pets',
    body: 'Every pet is an NFT that keeps the same token ID as it grows.',
    tone: 'gold',
    icon: <ShieldIcon />,
  },
  {
    title: 'Grow with items',
    body: 'Hats, cloth, shoes and food unlock levels. Bonuses are capped and visible.',
    tone: 'purple',
    icon: <GrowIcon />,
  },
  {
    title: 'Win with skill',
    body: 'Read the wind, set angle and power. First to win 2 of 3 rounds.',
    tone: 'blue',
    icon: <AimIcon />,
  },
  {
    title: 'Transparent escrow',
    body: 'Both entries are locked in a contract. The winner is paid exactly once.',
    tone: 'green',
    icon: <LockIcon />,
  },
]

export function Home() {
  useEffect(() => {
    document.title = 'Pet Fight'
  }, [])

  return (
    <>
      <section className="hero">
        <div className="copy">
          <span className="eyebrow">Skill-based PvP pet battles</span>
          <h1>
            Train. Grow.
            <br />
            <span>Battle.</span>
          </h1>
          <p>
            Collect pet NFTs, level them up with items, and outplay rivals in best-of-three artillery battles on Robinhood Chain. Aim, power and wind decide who wins.
          </p>
          <div className="actions">
            <button className="btn lg" type="button">
              Game play
            </button>
            <Link className="btn ghost lg" to="/docs#how">
              How it works
            </Link>
          </div>
          <p className="note">
            <InfoIcon />
            Public testnet beta. Game coins have no cash value.
          </p>
        </div>
        <div className="stage">
          <img src="/hero.jpg" alt="Pet Fight pets on a hill" />
        </div>
      </section>
      <section className="features" id="how" aria-label="Features">
        {features.map((feature) => (
          <article key={feature.title}>
            <div className={`ico ${feature.tone}`}>{feature.icon}</div>
            <div>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
