import { listChains } from '../_lib/eppChains.js'

/** GET /v1/event-processing-policy/chains — the chain registry, without rules. */
export default function eppChains() {
  return listChains()
}
