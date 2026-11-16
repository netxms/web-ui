import { dhcpScopes } from '../../../_lib/dhcp.js'

export default function () {
  return { entries: dhcpScopes() }
}
