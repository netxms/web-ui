import { callersOf, chainExists, chainIdFromUrl } from '../../../_lib/eppChains.js'

export default function eppChainCallers(req, res) {
  const chainId = chainIdFromUrl(req)
  if (chainId === null) {
    res.statusCode = 400
    return { error: 'Chain id is not a number' }
  }
  if (!chainExists(chainId)) {
    res.statusCode = 404
    return { error: `No such chain: ${chainId}` }
  }
  return callersOf(chainId)
}
