/** Live Robinhood testnet deployment. Real-value play stays off. */
export const TESTNET = {
  chainId: 46630,
  name: 'robinhood-testnet',
  rpc: 'https://rpc.testnet.chain.robinhood.com',
  petc: '0x6Ea1E56d978C726c864041Aeeb01BEE65F61b703',
  pets: '0x130B1da3DA46BdF060348c46d7156D0d88A30cac',
  escrow: '0x4A9A8A24f14Df5baF7454Bed33199E528C05CF0c',
  shop: '0x577C2B54Fd945662eb0EF46e3c2d59f2aA246FF5',
  vault: '0x9D012FA128a579569da24f04812A9d0425Ff57c0',
  pet: '0x1E9d9FCe560d8A691d6Bce813460891215300b2b',
} as const

export const ESCROW_STATUS = ['NONE', 'CREATED', 'HOST_FUNDED', 'READY', 'SETTLED', 'CANCELLED', 'EXPIRED'] as const

export type EscrowStatusName = (typeof ESCROW_STATUS)[number]
