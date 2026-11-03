import { chainIdFromUrl, deleteChain } from '../../_lib/eppChains.js'

/** DELETE /v1/event-processing-policy/chains/{chain-id} — chain, rules, and calls to it. */
export default function deleteEppChain(req, res) {
  const chainId = chainIdFromUrl(req)
  if (chainId === null) {
    res.statusCode = 400
    return { error: 'Chain id is not a number' }
  }
  if (chainId === 0) {
    res.statusCode = 405
    return { error: 'Main chain cannot be deleted' }
  }

  const result = deleteChain(chainId)
  if (!result) {
    res.statusCode = 404
    return { error: `No such chain: ${chainId}` }
  }
  return result
}
