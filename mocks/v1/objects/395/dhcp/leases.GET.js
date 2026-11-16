import { DHCP_SCOPE_IDS, dhcpLeases } from '../../../_lib/dhcp.js'

export default function (req, res) {
  const scope = new URL(req.url, 'http://mock').searchParams.get('scope')
  if (scope && !DHCP_SCOPE_IDS.has(scope)) {
    res.statusCode = 404
    return { reason: 'No such scope' }
  }
  return { entries: dhcpLeases(scope) }
}
