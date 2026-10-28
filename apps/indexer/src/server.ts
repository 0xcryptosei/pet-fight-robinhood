import { createServer } from 'node:http'
import { HOST } from './fixture'
import { sampleModel } from './fixture'
import { renderWallet } from './render'

const model = sampleModel()
const port = Number(process.env.PORT ?? 4173)

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/health') {
    response.setHeader('content-type', 'text/plain')
    response.end('ok')
    return
  }
  const wallet = url.searchParams.get('wallet') ?? HOST
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(renderWallet(model, wallet))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`collection http://127.0.0.1:${port}`)
})
