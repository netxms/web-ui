import { get, post, put, del } from './client'
import { isDemoDashboardId } from './demoDashboardStorage'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'

// Keyed by `${dashboardId}:${elementIndex}` — indices match the element order
// in mocks/v1/dashboards/*.json.
const MOCK_SCRIPT_DATA = DEMO_CONTENT_ENABLED
  ? {
      '700:4': {
        result: { 'HTTP Traffic': 1240, 'DNS Queries': 870, 'SNMP Polls': 320, ICMP: 140 },
      },
      '700:5': {
        result: [
          { name: 'Normal', value: 18, color: '#4abf76' },
          { name: 'Warning', value: 4, color: '#e9d401' },
          { name: 'Critical', value: 2, color: '#b91c1c' },
        ],
      },
      '701:4': { result: { 'CPU Load': 62, Memory: 78, 'Disk I/O': 45, Network: 55 } },
      '701:5': {
        result: [
          { name: 'Online', value: 22, color: '#22c55e' },
          { name: 'Degraded', value: 3, color: '#f97316' },
          { name: 'Offline', value: 1, color: '#d13a3a' },
        ],
      },
      '702:4': {
        result: { 'SLA Compliance': 99, Uptime: 98, 'MTTR (min)': 12, 'Change Success': 94 },
      },
      '702:5': {
        result: [
          { name: 'Resolved', value: 41, color: '#22c55e' },
          { name: 'Pending', value: 7, color: '#eab308' },
          { name: 'Escalated', value: 2, color: '#d13a3a' },
        ],
      },
      '703:5': { result: { 'web-01': 55, 'web-02': 48, 'db-primary': 82, 'fw-edge': 29 } },
      '703:6': {
        result: [
          { name: 'DC-Alpha', value: 12, color: '#3b82f6' },
          { name: 'DMZ', value: 5, color: '#f97316' },
          { name: 'VPN', value: 3, color: '#8b5cf6' },
          { name: 'Office', value: 4, color: '#22c55e' },
        ],
      },
    }
  : {}

/**
 * List all scripts in the library (ID and name only)
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export function getScriptLibrary() {
  return get('/v1/script-library')
}

/**
 * @param {number} scriptId
 * @returns {Promise<{id: number, name: string, code: string}>}
 */
export function getScript(scriptId) {
  return get(`/v1/script-library/${scriptId}`)
}

/**
 * @param {string} name
 * @param {string} code - NXSL source code
 * @returns {Promise<{id: number}>}
 */
export function createScript(name, code) {
  return post('/v1/script-library', { name, code })
}

/**
 * @param {number} scriptId
 * @param {string} name
 * @param {string} code - NXSL source code
 * @returns {Promise<{id: number}>}
 */
export function updateScript(scriptId, name, code) {
  return put(`/v1/script-library/${scriptId}`, { name, code })
}

/**
 * @param {number} scriptId
 * @returns {Promise<null>}
 */
export function deleteScript(scriptId) {
  return del(`/v1/script-library/${scriptId}`)
}

/**
 * Compile/validate an NXSL script without executing it.
 * @param {string} code - NXSL source code
 * @returns {Promise<{success: boolean, error?: {lineNumber: number, message: string}, warnings?: {lineNumber: number, message: string}[]}>}
 */
export function compileScript(code) {
  return post('/v1/script-library/compile', { code })
}

/**
 * Execute an NXSL script in the context of an object.
 *
 * With `stream`, the server compiles the script (a compilation error still answers 400) and
 * answers 202 `{executionId, token, expiresIn, wsUrl}`. The script starts once `wsUrl` is
 * connected (`openOutputStream`), which carries its `print`/`trace` output and its result. An
 * older server ignores the flag and answers with the result.
 *
 * @param {number} objectId
 * @param {object} params
 * @param {string} params.script - NXSL source code
 * @param {string[]} [params.parameters] - script parameters
 * @param {boolean} [params.resultAsMap] - force result as JSON map
 * @param {boolean} [params.stream] - stream output over a WebSocket
 * @returns {Promise<{result: any} | {executionId: number, token: string, expiresIn: number, wsUrl: string}>}
 */
export function executeScript(
  objectId,
  { script, parameters = [], resultAsMap = false, stream = false },
) {
  return post(`/v1/objects/${objectId}/execute-script`, {
    script,
    parameters,
    resultAsMap,
    stream,
  })
}

/**
 * Stop a streamed script execution. Asynchronous: the output stream then sends `stopped`. A
 * stop that arrives before the stream connects keeps the script from starting. 404 once the
 * execution has finished.
 * @param {number} executionId - `executionId` from the 202 answer
 * @returns {Promise<null>}
 */
export function stopScriptExecution(executionId) {
  return post(`/v1/script-executions/${executionId}/stop`)
}

/**
 * Execute a dashboard element's embedded NXSL script on the server.
 * @param {number} dashboardId - Dashboard object ID (path parameter)
 * @param {object} params
 * @param {number} params.objectId - Context object ID for script execution
 * @param {number} params.elementIndex - Index of the dashboard element containing the script
 * @returns {Promise<{ result: Record<string, string> }>}
 */
export function executeDashboardScript(dashboardId, { objectId, elementIndex }) {
  if (isDemoDashboardId(dashboardId)) {
    const key = `${dashboardId}:${elementIndex}`
    return Promise.resolve(MOCK_SCRIPT_DATA[key] ?? { result: {} })
  }
  return post(`/v1/objects/${dashboardId}/execute-dashboard-script`, { objectId, elementIndex })
}
