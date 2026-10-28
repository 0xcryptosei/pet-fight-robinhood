const RPC = 'https://rpc.testnet.chain.robinhood.com'
const CHAIN_ID = '0xb626'

export const PET = '0x1E9d9FCe560d8A691d6Bce813460891215300b2b'
export const PETC = '0xD33BbB7C15DFc7334c3D2CefA3acbb51fa24c6f2'
export const VAULT = '0xdbd03fD028Caa0E632Ffa367a05d3Fc7829BeC09'

const BALANCE_OF = '0x70a08231'
const ALLOWANCE = '0xdd62ed3e'
const APPROVE = '0x095ea7b3'
const POSITIONS = '0x55f57510'
const PENDING_REWARD = '0xf40f0f52'
const STAKE = '0xa694fc3a'
const WITHDRAW = '0x2e1a7d4d'
const CLAIM = '0x4e71d92d'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export type StakeView = {
  pet: bigint
  petc: bigint
  staked: bigint
  reward: bigint
  lockedUntil: bigint
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

export async function readPetcBalance(account: string): Promise<bigint> {
  return word(await call(PETC, BALANCE_OF + pad(account)), 0)
}

export function notifyPetc(): void {
  window.dispatchEvent(new Event('petfight-petc'))
}

async function call(to: string, data: string): Promise<string> {
  const result = await rpc('eth_call', [{ to, data }, 'latest'])
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

async function send(from: string, to: string, data: string): Promise<void> {
  const ethereum = getEthereum()
  if (!ethereum) throw new Error('MetaMask is not installed in this browser.')
  await switchToTestnet(ethereum)
  let hash: unknown
  try {
    hash = await ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to, data }] })
  } catch (error) {
    if (errorCode(error) === 4001) throw new Error('The wallet request was cancelled.')
    throw error
  }
  if (typeof hash !== 'string' || !hash.startsWith('0x')) throw new Error('The wallet did not return a transaction.')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const receipt = (await rpc('eth_getTransactionReceipt', [hash])) as { status?: string } | null
    if (receipt) {
      if (receipt.status === '0x1') return
      throw new Error('The transaction failed.')
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('The transaction is still pending.')
}

export function parseUnits(input: string): bigint | null {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return null
  const [whole, fraction = ''] = trimmed.split('.')
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'))
}

export function formatUnits(wei: bigint): string {
  const negative = wei < 0n
  const value = negative ? -wei : wei
  const whole = value / 10n ** 18n
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '')
  const text = fraction ? `${whole.toLocaleString('en-US')}.${fraction}` : whole.toLocaleString('en-US')
  return negative ? `-${text}` : text
}

export async function readStake(account: string): Promise<StakeView> {
  const accountWord = pad(account)
  const [pet, petc, position, reward] = await Promise.all([
    call(PET, BALANCE_OF + accountWord),
    call(PETC, BALANCE_OF + accountWord),
    call(VAULT, POSITIONS + accountWord),
    call(VAULT, PENDING_REWARD + accountWord),
  ])
  return {
    pet: word(pet, 0),
    petc: word(petc, 0),
    staked: word(position, 0),
    reward: word(reward, 0),
    lockedUntil: word(position, 3),
  }
}

export async function stakePet(account: string, amount: bigint): Promise<void> {
  const allowance = word(await call(PET, ALLOWANCE + pad(account) + pad(VAULT)), 0)
  if (allowance < amount) {
    await send(account, PET, APPROVE + pad(VAULT) + pad(amount.toString(16)))
  }
  await send(account, VAULT, STAKE + pad(amount.toString(16)))
}

export async function withdrawPet(account: string, amount: bigint): Promise<void> {
  await send(account, VAULT, WITHDRAW + pad(amount.toString(16)))
}

export async function withdrawPetc(account: string): Promise<void> {
  await send(account, VAULT, CLAIM)
}
