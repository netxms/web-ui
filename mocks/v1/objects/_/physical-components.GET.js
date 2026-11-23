import { COMPONENT_TREES, nodeIdOf } from '../../_lib/nodeInventory.js'

export default function (req) {
  const root = COMPONENT_TREES[nodeIdOf(req)] ?? null
  return { timestamp: root ? '2026-11-23T06:00:00Z' : null, root }
}
