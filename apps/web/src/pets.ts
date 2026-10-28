const RPC = 'https://rpc.testnet.chain.robinhood.com'
export const PETS = '0x2995Ab130Ff920D964E57e260a2Ffce1A1B8966F'

const BALANCE_OF = '0x70a08231'
const TOKEN_OF_OWNER = '0x2f745c59'
const PET = '0xcfb869bf'
const MINT_DOG = '0x90cfee3e'
const CHAIN_ID = '0xb626'

export const DOG_SPECIES = 1

export const DOG_BASE = { hp: 100, pwr: 70, int: 50 }

export type OwnedPet = {
  tokenId: string
  speciesId: number
  level: number
}

export type DogStats = { hp: number; pwr: number; int: number }

export type GearCounts = { hat: number; cloth: number; shoes: number; food: number }

/** One upgrade is 1 Cloth and 3 Food, which add HP +10, and 1 Hat and 1 Shoes, which add Power +7. */
export const CLOTH_HP = 4
export const FOOD_HP = 2
export const HAT_PWR = 4
export const SHOES_PWR = 3
export const UPGRADE_HP = CLOTH_HP + FOOD_HP * 3
export const UPGRADE_PWR = HAT_PWR + SHOES_PWR

/** HP and Power come from the item counts saved on the upgrade contract. INT still follows the level. */
export function gearStats(gear: GearCounts, level: number): DogStats {
  const steps = Math.max(0, level - 1)
  return {
    hp: DOG_BASE.hp + gear.cloth * CLOTH_HP + gear.food * FOOD_HP,
    pwr: DOG_BASE.pwr + gear.hat * HAT_PWR + gear.shoes * SHOES_PWR,
    int: DOG_BASE.int + Math.floor((DOG_BASE.int * steps) / 10),
  }
}

function upgradeKey(owner: string, tokenId: string): string {
  return `petfight.petlevel.${owner.toLowerCase()}.${tokenId}`
}

export function savedLevel(owner: string, tokenId: string, chainLevel: number): number {
  const raw = localStorage.getItem(upgradeKey(owner, tokenId))
  const saved = raw && /^\d+$/.test(raw) ? Number(raw) : chainLevel
  return Math.max(chainLevel, saved)
}

export function saveUpgrade(owner: string, tokenId: string, level: number): void {
  localStorage.setItem(upgradeKey(owner, tokenId), String(level))
}

function pad(value: string): string {
  return value.replace(/^0x/i, '').toLowerCase().padStart(64, '0')
}

function word(data: string, index: number): bigint {
  const body = data.replace(/^0x/i, '')
  const slice = body.slice(index * 64, index * 64 + 64)
  if (!slice) return 0n
  return BigInt(`0x${slice}`)
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getEthereum(): EthereumProvider | null {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum
  return ethereum?.request ? ethereum : null
}

function errorCode(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'number') return code
  }
  return null
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? 'The chain call failed.')
  return body.result
}

async function call(to: string, data: string, from?: string): Promise<string> {
  const tx = from ? { from, to, data } : { to, data }
  const result = await rpc('eth_call', [tx, 'latest'])
  return typeof result === 'string' ? result : '0x'
}

async function switchToTestnet(ethereum: EthereumProvider): Promise<void> {
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] })
  } catch (error) {
    if (errorCode(error) !== 4902) throw error
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN_ID,
          chainName: 'Robinhood Chain Testnet',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: [RPC],
          blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'],
        },
      ],
    })
  }
}

export async function readOwnedPets(account: string): Promise<OwnedPet[]> {
  const balance = word(await call(PETS, BALANCE_OF + pad(account)), 0)
  const count = Number(balance)
  const pets: OwnedPet[] = []
  for (let index = 0; index < count; index += 1) {
    const tokenId = word(await call(PETS, TOKEN_OF_OWNER + pad(account) + pad(index.toString(16))), 0)
    const data = await call(PETS, PET + pad(tokenId.toString(16)))
    const speciesId = Number(word(data, 0))
    if (speciesId !== DOG_SPECIES) continue
    pets.push({
      tokenId: tokenId.toString(),
      speciesId,
      level: Number(word(data, 1)),
    })
  }
  return pets
}

export function signedInAddress(): string | null {
  const raw = sessionStorage.getItem('petfight.session')
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as { address?: string }
    return typeof session.address === 'string' ? session.address : null
  } catch {
    return null
  }
}

export async function mintDog(account: string): Promise<void> {
  try {
    await call(PETS, MINT_DOG, account)
  } catch {
    throw new Error('Creating a pet mints the dog and the contract sends 100 PETC. The pet contract on testnet does not include that mint yet, so this wallet cannot create a pet until that contract is deployed.')
  }
  const ethereum = getEthereum()
  if (!ethereum) throw new Error('MetaMask is not installed in this browser.')
  await switchToTestnet(ethereum)
  let hash: unknown
  try {
    hash = await ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: PETS, data: MINT_DOG }] })
  } catch (error) {
    if (errorCode(error) === 4001) throw new Error('The wallet request was cancelled.')
    throw error
  }
  if (typeof hash !== 'string' || !hash.startsWith('0x')) throw new Error('The wallet did not return a transaction.')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const receipt = (await rpc('eth_getTransactionReceipt', [hash])) as { status?: string } | null
    if (receipt) {
      if (receipt.status === '0x1') return
      throw new Error('The mint transaction failed.')
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('The mint transaction is still pending.')
}
