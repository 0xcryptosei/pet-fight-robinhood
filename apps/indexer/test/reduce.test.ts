import { describe, expect, it } from 'vitest'
import { CONTRACTS, FAUCET, GUEST, HOST, sampleLogs, sampleModel, STAKE } from '../src/fixture'
import { balancesOf, emptyModel, petsOf } from '../src/model'
import { renderWallet } from '../src/render'
import { applyLog, applyLogs } from '../src/reduce'

describe('chain read model', () => {
  it('keeps the starter token id and splits the three balance buckets', () => {
    const funded = applyLogs(sampleLogs().slice(0, 10), CONTRACTS)
    const hostBalances = balancesOf(funded, HOST)
    expect(hostBalances.available).toBe((FAUCET - STAKE).toString())
    expect(hostBalances.lockedInRooms).toBe(STAKE.toString())
    expect(hostBalances.pendingSettlement).toBe('0')

    const started = applyLogs(sampleLogs().slice(0, 13), CONTRACTS)
    expect(balancesOf(started, HOST).lockedInRooms).toBe('0')
    expect(balancesOf(started, HOST).pendingSettlement).toBe(STAKE.toString())
    expect(balancesOf(started, GUEST).pendingSettlement).toBe(STAKE.toString())

    const settled = sampleModel()
    expect(balancesOf(settled, HOST).available).toBe((FAUCET - STAKE + STAKE * 2n).toString())
    expect(balancesOf(settled, HOST).pendingSettlement).toBe('0')
    expect(balancesOf(settled, GUEST).available).toBe((FAUCET - STAKE).toString())
    expect(balancesOf(settled, GUEST).lockedInRooms).toBe('0')

    const [pet] = petsOf(settled, HOST)
    expect(pet.tokenId).toBe('1')
    expect(pet.speciesId).toBe(1)
    expect(pet.level).toBe(4)
    expect(pet.metadataVersion).toBe(3)
    expect(pet.xpCheckpoint).toBe(0n)

    const again = applyLogs(sampleLogs(), CONTRACTS, settled)
    expect(balancesOf(again, HOST)).toEqual(balancesOf(settled, HOST))
  })

  it('reverses a removed log without paying the pot twice', () => {
    const logs = sampleLogs()
    const model = sampleModel()
    for (const log of [...logs].reverse()) {
      applyLog(model, { ...log, removed: true }, CONTRACTS)
    }
    expect(petsOf(model, HOST)).toHaveLength(0)
    expect(balancesOf(model, HOST).available).toBe('0')
    expect(balancesOf(model, GUEST).available).toBe('0')
    expect(emptyModel().pets.size).toBe(0)
  })

  it('renders the collection with separate balance labels', () => {
    const html = renderWallet(applyLogs(sampleLogs().slice(0, 10), CONTRACTS), HOST)
    expect(html).toContain('Available')
    expect(html).toContain('Locked in rooms')
    expect(html).toContain('Pending settlement')
    expect(html).toContain('9980 PETC')
    expect(html).toContain('20 PETC')
    expect(html).toContain('Token 1')
    expect(html).toContain('Dog')
    expect(html).toContain('>4<')
    expect(html).not.toContain('<script')
  })
})
