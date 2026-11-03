import { formatIpAddress, getStatusInfo } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'

export const MAC_TYPE_SEVERITY = {
  DIRECT: 'direct',
  INDIRECT: 'indirect',
  WIRELESS: 'wireless',
  UNKNOWN: 'muted',
  NOT_FOUND: 'muted',
}

/**
 * A missing summary with a non-zero id means the account cannot read the object (ACL), not an
 * error; a zero id means there is no object.
 *
 * @param {object|null|undefined} summary
 * @param {number|undefined} id
 * @returns {string|null}
 */
function nameFor(summary, id) {
  if (summary?.name) return summary.name
  return id ? `[${id}]` : null
}

/**
 * `target` is the single best destination for surfaces with one link per row.
 *
 * @param {object} hit - raw item from `GET /v1/find/mac-address`
 */
export function describeMacHit(hit) {
  const owner = hit.localNode ?? null
  const ownerIface = hit.localInterface ?? null
  const swNode = hit.node ?? null
  const swIface = hit.interface ?? null

  const linkObject = owner ?? swNode
  const linkId = owner ? hit.localNodeId : hit.nodeId

  return {
    ownerName: nameFor(owner, hit.localNodeId),
    ifaceName: nameFor(ownerIface, hit.localInterfaceId),
    switchName: nameFor(swNode, hit.nodeId),
    portName: nameFor(swIface, hit.interfaceId),
    ownerObject: owner,
    switchObject: swNode,
    portObject: swIface,
    mac: hit.localMacAddress,
    ip: formatIpAddress(hit.localIpAddress),
    switchIp: formatIpAddress(swNode?.ipAddress),
    ifIndex: hit.interfaceIndex || null,
    type: hit.type,
    status: owner ? getStatusInfo(owner.status) : null,
    target: linkObject && linkId ? objectTarget(linkObject) : null,
  }
}
