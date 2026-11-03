import { chainIdFromUrl, readBody, updateChain } from '../../_lib/eppChains.js'

/** PUT /v1/event-processing-policy/chains/{chain-id} — name, description, access list. */
export default async function updateEppChain(req, res) {
  const chainId = chainIdFromUrl(req)
  if (chainId === null) {
    res.statusCode = 400
    return { error: 'Chain id is not a number' }
  }
  if (chainId === 0) {
    res.statusCode = 405
    return { error: 'Main chain has fixed name and no access list' }
  }

  const body = await readBody(req)
  if (body.name !== undefined && !String(body.name).trim()) {
    res.statusCode = 400
    return { error: 'Chain name cannot be empty' }
  }

  const chain = updateChain(chainId, {
    name: body.name === undefined ? undefined : String(body.name).trim(),
    description: body.description,
    accessList: body.accessList,
  })
  if (!chain) {
    res.statusCode = 404
    return { error: `No such chain: ${chainId}` }
  }
  return chain
}
