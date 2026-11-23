import { SESSIONS, nodeIdOf } from '../../_lib/nodeInventory.js'

export default function (req, res) {
  const entries = SESSIONS[nodeIdOf(req)]
  if (!entries) {
    res.statusCode = 503
    return { reason: 'No connection to agent' }
  }
  return { entries }
}
