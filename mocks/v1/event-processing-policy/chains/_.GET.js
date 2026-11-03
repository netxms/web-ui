import { chainIdFromUrl, getChain } from '../../_lib/eppChains.js'

/** GET /v1/event-processing-policy/chains/{chain-id} — one chain with its rules. */
export default function eppChain(req, res) {
  const chainId = chainIdFromUrl(req)
  if (chainId === null) {
    res.statusCode = 400
    return { error: 'Chain id is not a number' }
  }

  const chain = getChain(chainId)
  if (!chain) {
    res.statusCode = 404
    return { error: `No such chain: ${chainId}` }
  }
  return chain
}
