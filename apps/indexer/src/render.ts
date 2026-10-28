import { SPECIES, balancesOf, formatPetc, petsOf, type Pet, type ReadModel } from './model'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function petCard(pet: Pet): string {
  const species = SPECIES[pet.speciesId]
  const name = species?.name ?? 'Unknown species'
  return `<article class="pet">
    <p class="eyebrow">Token ${escapeHtml(pet.tokenId)}</p>
    <h2>${escapeHtml(name)}</h2>
    <dl>
      <div><dt>Species</dt><dd>${escapeHtml(name)}</dd></div>
      <div><dt>Level</dt><dd>${pet.level}</dd></div>
      <div><dt>XP checkpoint</dt><dd>${pet.xpCheckpoint.toString()}</dd></div>
      <div><dt>Metadata version</dt><dd>${pet.metadataVersion}</dd></div>
    </dl>
    <p class="note">Health ${species?.health ?? '—'}, power ${species?.power ?? '—'}, and intelligence ${species?.intelligence ?? '—'} are derived from rules version 1. They are not stored on the token.</p>
  </article>`
}

export function renderWallet(model: ReadModel, wallet: string): string {
  const balances = balancesOf(model, wallet)
  const pets = petsOf(model, wallet)
  const cards = pets.length > 0 ? pets.map(petCard).join('') : '<p class="empty">No pets on this wallet.</p>'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pet Fight collection</title>
  <style>
    :root { color-scheme: light; font-family: Georgia, "Iowan Old Style", serif; background: #f4efe6; color: #241c16; }
    body { margin: 0 auto; max-width: 880px; padding: 32px 20px 64px; }
    h1 { font-size: 40px; margin-bottom: 4px; }
    .lede, .note, .empty { color: #5c5148; }
    .wallet { font-family: ui-monospace, monospace; font-size: 14px; }
    .balances { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
    .balances article, .pet { background: #fffdf8; border: 1px solid #e2d8c8; border-radius: 16px; padding: 16px; }
    .balances dt, .pet dt { font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #6d6258; }
    .balances dd { margin: 8px 0 0; font-size: 28px; }
    .pet h2 { margin: 0 0 8px; }
    .pet dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .pet dd { margin: 0; font-size: 20px; }
    @media (max-width: 700px) { .balances, .pet dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <p class="eyebrow">Local collection</p>
  <h1>Pet Fight</h1>
  <p class="lede">PETC on this page is a non-redeemable test token. Locked coins are not spendable. This view is not mainnet and not a public testnet deployment.</p>
  <p class="wallet">${escapeHtml(wallet.toLowerCase())}</p>
  <section class="balances">
    <article><dl><dt>Available</dt><dd>${formatPetc(BigInt(balances.available))} PETC</dd></dl></article>
    <article><dl><dt>Locked in rooms</dt><dd>${formatPetc(BigInt(balances.lockedInRooms))} PETC</dd></dl></article>
    <article><dl><dt>Pending settlement</dt><dd>${formatPetc(BigInt(balances.pendingSettlement))} PETC</dd></dl></article>
  </section>
  <section>${cards}</section>
</body>
</html>`
}
