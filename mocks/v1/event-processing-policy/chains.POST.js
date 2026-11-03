import { createChain, readBody } from '../_lib/eppChains.js'

export default async function createEppChain(req, res) {
  const body = await readBody(req)
  const name = (body.name ?? '').trim()
  if (!name) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Chain name is required' }))
    return
  }

  const chain = createChain({
    name,
    description: body.description ?? '',
    accessList: body.accessList ?? [],
  })
  res.statusCode = 201
  return chain
}
