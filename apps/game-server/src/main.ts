import { buildApp } from './app'

const port = Number(process.env.PORT ?? 4000)
const app = await buildApp({ betaPaused: process.env.BETA_PAUSED === 'true' })
await app.listen({ port, host: '127.0.0.1' })
console.log(`Pet Fight local server on ${port}`)
