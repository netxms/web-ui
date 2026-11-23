import { nodeIdOf, processesFor, servicesFor } from '../../../_lib/nodeInventory.js'

export default function (req, res) {
  const params = new URL(req.url, 'http://mock').searchParams
  const nodeId = nodeIdOf(req)
  const name = params.get('name')
  const processes = processesFor(nodeId)
  if (!processes || params.get('origin') !== 'agent') {
    res.statusCode = 503
    return { reason: 'Cannot communicate with data source' }
  }
  const table = name === 'System.Processes' ? processes : name === 'System.Services' ? servicesFor(nodeId) : null
  if (!table) {
    res.statusCode = 404
    return { reason: 'Metric is not supported' }
  }
  return { table }
}
