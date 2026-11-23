import { SOFTWARE, nodeIdOf } from '../../_lib/nodeInventory.js'

export default function (req) {
  return { entries: SOFTWARE[nodeIdOf(req)] ?? null }
}
