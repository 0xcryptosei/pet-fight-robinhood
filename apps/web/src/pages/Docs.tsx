import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const nav = [
  { to: '/docs#how', label: 'How it works' },
  { to: '/docs#fair-play', label: 'Fair-play rules' },
  { to: '/docs#terms', label: 'Terms of Service' },
  { to: '/docs#privacy', label: 'Privacy' },
  { to: '/docs#contracts', label: 'Contract addresses' },
]

const sections = [
  {
    id: 'how',
    title: 'How it works',
    items: [
      'Connect a wallet on Robinhood Chain Testnet (chain id 46630). Test ETH is not mainnet ETH.',
      'A wallet starts with no pet. Create a pet to battle. That mints one dog NFT and the contract sends 100 PETC to the wallet. Every dog starts at HP 100, Power 70, and INT 50. Only the owner can upgrade that dog, and each level adds 10% of those base stats.',
      'A match is best of three. Each turn you choose an action, then set angle and power. Wind moves the shot.',
      'Both players lock the same PETC entry. Tiers are 10, 20, 50, 100, and 1,000. The room fee is 0, so the winner receives the full pot. A draw returns both entries.',
      'The shop sells PETC from a pre-funded inventory at 10,000 PETC per 1 test ETH. There is no sell-back.',
      'Staking test $PET pays 0.000001 PETC per 1 $PET per day from a funded pool. The lock is 7 days from the latest stake. Unstake returns $PET only. Rewards are not minted, and staked $PET is not a cash reserve.',
    ],
  },
  {
    id: 'fair-play',
    title: 'Fair-play rules',
    items: [
      'Both players put in the same amount. The contract pays the winner once. Nobody on the project can assign a winner.',
      'Before the match, the server publishes a hash of the wind seed. After the match it reveals the seed, so the wind can be checked.',
      'Turns are timed at 15 seconds while you are connected. The first disconnect in a turn pauses once and gives 30 seconds. Three timeout passes in a row forfeit the match.',
      'A room with no opponent can be cancelled by the host, or it refunds when the 10-minute join window ends. If both players deposited and the match does not finish, the start window (2 minutes) or the settle window (30 minutes) refunds both. Refunds take no fee.',
      'Support cannot change a finished result and cannot redeem PETC.',
    ],
  },
  {
    id: 'terms',
    title: 'Terms of Service',
    intro: 'These are the rules of the public testnet beta. They are not a counsel-approved legal agreement, and nothing here is an offer of real-value wagering.',
    items: [
      'PETC cannot be redeemed for ETH, cash, or any other asset.',
      'Balances on the local server are test credits. A chain deposit is the PETC locked in the escrow contract.',
      'The shop, the stake reward, and the escrow use the testnet contracts listed below. Mainnet play is not available.',
      'You are responsible for your own wallet. Do not send a private key or a seed phrase to the site, the server, or support.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    intro: 'This is a testnet beta note, not a counsel-written privacy policy.',
    items: [
      'The server keeps your wallet address, login nonce, session token, and match transcript in memory. A restart clears them.',
      'There is no account email and no identity check.',
      'Wallet signatures stay in your wallet. The site only asks the wallet to sign a login message.',
    ],
  },
]

const contracts = [
  { name: 'PetCoin (PETC)', address: '0xD33BbB7C15DFc7334c3D2CefA3acbb51fa24c6f2' },
  { name: 'PetNFT', address: '0x2995Ab130Ff920D964E57e260a2Ffce1A1B8966F' },
  { name: 'BattleEscrow', address: '0xE40D2d80E11ef4dD2F9E6Cfa02700967b0972958' },
  { name: 'PetShop', address: '0xb86fC3115967F7eBb14094F1B3199A018e9ca55A' },
  { name: 'StakingVault', address: '0xdbd03fD028Caa0E632Ffa367a05d3Fc7829BeC09' },
  { name: '$PET', address: '0x1E9d9FCe560d8A691d6Bce813460891215300b2b' },
]

export function Docs() {
  useEffect(() => {
    document.title = 'Docs — Pet Fight'
  }, [])

  return (
    <>
      <nav className="docs-nav" aria-label="Docs">
        {nav.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="docs-body">
        <p className="eyebrow">Public testnet beta</p>
        <h1>Docs</h1>
        <p className="lead">
          Pet Fight is a skill-based pet battle on Robinhood Chain Testnet. Game coins have no cash value and cannot be redeemed.
        </p>
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2>{section.title}</h2>
            {section.intro ? <p>{section.intro}</p> : null}
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <section id="contracts">
          <h2>Contract address</h2>
          <p>Robinhood Chain Testnet, chain id 46630. Each address opens on the testnet explorer.</p>
          <div className="addr">
            {contracts.map((contract) => (
              <a
                key={contract.address}
                href={`https://explorer.testnet.chain.robinhood.com/address/${contract.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {contract.name}
                <code>{contract.address}</code>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
