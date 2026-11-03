/**
 * Agent tunnels. Binding has the server issue the agent a certificate for a node; the agent then
 * reconnects with it, and only then is the tunnel listed as bound (`nodeId` set).
 */

/**
 * @typedef {object} AgentTunnel
 * @property {number} id - tunnel id, unique among the tunnels currently connected
 * @property {number} nodeId - 0 while unbound
 * @property {boolean} bound
 * @property {boolean} inbound - opened by the agent (the usual case) rather than by the server
 * @property {string} address - peer IP address, '' when the server sent none
 * @property {{ address?: string }|null} addressObject - as sent, for `ipSortKey`
 * @property {number} zoneUIN
 * @property {string} systemName
 * @property {string} systemInformation
 * @property {string} hostname
 * @property {string} platformName
 * @property {string} agentVersion
 * @property {string} agentBuildTag
 * @property {string} agentId
 * @property {string} hardwareId - hex, '' when the agent reported none
 * @property {string} serialNumber
 * @property {number} activeChannelCount
 * @property {boolean} userAgentInstalled
 * @property {boolean} agentProxy
 * @property {boolean} snmpProxy
 * @property {boolean} snmpTrapProxy
 * @property {boolean} syslogProxy
 * @property {string} certificateIssuer
 * @property {string} certificateSubject
 * @property {string|null} certificateExpirationTime - ISO 8601
 * @property {boolean} externallyProvisionedCertificate
 * @property {string|null} connectionTime - ISO 8601
 */

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

/**
 * Strings default to '' so the table, filter and CSV never see null.
 *
 * @returns {AgentTunnel}
 */
export function adaptAgentTunnel(raw) {
  const nodeId = Number(raw?.nodeId) || 0
  const agentId = raw?.agentId && raw.agentId !== NULL_GUID ? String(raw.agentId) : ''
  return {
    id: Number(raw?.id) || 0,
    nodeId,
    bound: raw?.bound ?? nodeId !== 0,
    inbound: raw?.inbound !== false,
    address: raw?.address?.address ?? '',
    addressObject: raw?.address ?? null,
    zoneUIN: Number(raw?.zoneUIN) || 0,
    systemName: raw?.systemName ?? '',
    systemInformation: raw?.systemInformation ?? '',
    hostname: raw?.hostname ?? '',
    platformName: raw?.platformName ?? '',
    agentVersion: raw?.agentVersion ?? '',
    agentBuildTag: raw?.agentBuildTag ?? '',
    agentId,
    hardwareId: raw?.hardwareId ?? '',
    serialNumber: raw?.serialNumber ?? '',
    activeChannelCount: Number(raw?.activeChannelCount) || 0,
    userAgentInstalled: raw?.userAgentInstalled === true,
    agentProxy: raw?.agentProxy === true,
    snmpProxy: raw?.snmpProxy === true,
    snmpTrapProxy: raw?.snmpTrapProxy === true,
    syslogProxy: raw?.syslogProxy === true,
    certificateIssuer: raw?.certificateIssuer ?? '',
    certificateSubject: raw?.certificateSubject ?? '',
    certificateExpirationTime: raw?.certificateExpirationTime ?? null,
    externallyProvisionedCertificate: raw?.externallyProvisionedCertificate === true,
    connectionTime: raw?.connectionTime ?? null,
  }
}

export function hasProxyFunction(tunnel) {
  return tunnel.agentProxy || tunnel.snmpProxy || tunnel.snmpTrapProxy || tunnel.syslogProxy
}

/**
 * Mirrors the server's 409 cases, so "Create node and bind" cannot leave behind a new node that
 * never gets its tunnel.
 *
 * @param {AgentTunnel} tunnel
 * @returns {string|null}
 */
export function bindBlockedReason(tunnel) {
  if (tunnel.bound) return 'The tunnel is already bound to a node'
  if (tunnel.externallyProvisionedCertificate) {
    return 'The server refuses to bind an agent with an externally provisioned certificate'
  }
  return null
}

/** The fields the legacy tunnel filter matches against, plus the hostname. */
export function tunnelFilterFields(tunnel, nodeName) {
  return [
    String(tunnel.id),
    tunnel.bound ? 'bound' : 'unbound',
    tunnel.bound ? nodeName : '',
    tunnel.address,
    tunnel.bound ? String(tunnel.activeChannelCount) : '',
    tunnel.systemName,
    tunnel.hostname,
    tunnel.platformName,
    tunnel.systemInformation,
    tunnel.hardwareId,
    tunnel.agentVersion,
  ]
}

/**
 * Like the legacy client, "Create node and bind" waits for this before it sets the new node
 * managed, so the first configuration poll goes through the tunnel.
 *
 * @param {object} options
 * @param {() => Promise<AgentTunnel[]>} options.fetchTunnels
 * @param {number} options.nodeId
 * @param {number} [options.timeoutMs=20000]
 * @param {number} [options.intervalMs=1000]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now]
 * @returns {Promise<AgentTunnel|null>} null on timeout
 */
export async function waitForBoundTunnel({
  fetchTunnels,
  nodeId,
  timeoutMs = 20000,
  intervalMs = 1000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}) {
  const deadline = now() + timeoutMs
  for (;;) {
    let tunnels = []
    try {
      tunnels = await fetchTunnels()
    } catch {
      // A failed poll is not a verdict; keep trying until the deadline.
    }
    const found = tunnels.find((t) => t.bound && t.nodeId === nodeId)
    if (found) return found
    if (now() + intervalMs > deadline) return null
    await sleep(intervalMs)
  }
}
