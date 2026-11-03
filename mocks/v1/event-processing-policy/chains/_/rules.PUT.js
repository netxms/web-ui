import { chainIdFromUrl, readBody, replaceChainRules } from '../../../_lib/eppChains.js'

export default async function updateEppChainRules(req, res) {
  const chainId = chainIdFromUrl(req)
  if (chainId === null) {
    res.statusCode = 400
    return { error: 'Chain id is not a number' }
  }

  const body = await readBody(req)
  const { status, body: result } = replaceChainRules(chainId, body)
  res.statusCode = status
  return result
}
