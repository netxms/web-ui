import { HARDWARE, nodeIdOf } from '../../_lib/nodeInventory.js'

export default function (req) {
  return { entries: HARDWARE[nodeIdOf(req)] ?? null }
}
