import { safeFilename } from './csvExport'

/** Legacy AgentLogViewer.SHOW_LIMIT. */
export const AGENT_LOG_TAIL_BYTES = 1048576

// Agent error codes (nms_agent.h) as the server passes them on in `agentErrorCode`.
const AGENT_ERRORS = {
  400: 'The agent is too old to send its log. Upgrade the agent on this node.',
  403: 'The agent does not accept this request from the server. The agent configuration must list the server in MasterServers.',
  945: 'The agent does not write its log to a file (it logs to syslog, the Windows event log, systemd or standard output).',
}

/**
 * A tail starts at an arbitrary byte, so its first line is usually incomplete. The server can
 * send slightly more than the limit (data written during the transfer).
 *
 * @param {string} text
 * @param {number} byteLength - size of the response body
 * @param {number} [limit]
 * @returns {{ text: string, truncated: boolean }}
 */
export function agentLogTail(text, byteLength, limit = AGENT_LOG_TAIL_BYTES) {
  const truncated = byteLength >= limit
  if (!truncated) return { text, truncated }
  const lineEnd = text.indexOf('\n')
  return { text: lineEnd >= 0 ? text.slice(lineEnd + 1) : text, truncated }
}

/** @param {string} [nodeName] */
export function agentLogFilename(nodeName) {
  return `${safeFilename(nodeName, 'node')}-nxagentd.log`
}

/**
 * @param {{ status?: number, message?: string, data?: object }} err - ApiError
 * @returns {string}
 */
export function describeAgentLogError(err) {
  const code = err?.data?.agentErrorCode
  if (code != null) {
    return AGENT_ERRORS[code] ?? `Agent error ${code}: ${err.data.agentErrorText ?? 'unknown'}`
  }
  if (err?.status === 403) {
    return 'You do not have the "Download files" access right on this node.'
  }
  // The object exists (it is on screen), so a 404 is the route.
  if (err?.status === 404) return 'This server version cannot read the agent log.'
  if (err?.status === 400) return 'Only a node has an agent log.'
  return err?.message || 'Could not read the agent log.'
}
