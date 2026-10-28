/** Live Robinhood testnet deployment. Real-value play stays off. */
export const TESTNET = {
  chainId: 46630,
  name: 'robinhood-testnet',
  rpc: 'https://rpc.testnet.chain.robinhood.com',
  petc: '0xD33BbB7C15DFc7334c3D2CefA3acbb51fa24c6f2',
  pets: '0x2995Ab130Ff920D964E57e260a2Ffce1A1B8966F',
  escrow: '0xE40D2d80E11ef4dD2F9E6Cfa02700967b0972958',
  shop: '0xb86fC3115967F7eBb14094F1B3199A018e9ca55A',
  vault: '0xdbd03fD028Caa0E632Ffa367a05d3Fc7829BeC09',
  pet: '0x1E9d9FCe560d8A691d6Bce813460891215300b2b',
} as const

export const ESCROW_STATUS = ['NONE', 'CREATED', 'HOST_FUNDED', 'READY', 'SETTLED', 'CANCELLED', 'EXPIRED'] as const

export type EscrowStatusName = (typeof ESCROW_STATUS)[number]
