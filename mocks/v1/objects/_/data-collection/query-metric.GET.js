import { CPU_COUNTS, nodeIdOf } from '../../../_lib/nodeInventory.js'

export default function (req, res) {
  const params = new URL(req.url, 'http://mock').searchParams
  const count = CPU_COUNTS[nodeIdOf(req)]
  if (params.get('name') !== 'System.CPU.Count' || !count) {
    res.statusCode = 404
    return { reason: 'Metric is not supported' }
  }
  return { value: String(count) }
}
