// GET /v1/objects/{id}/agent-log?sizeLimit= : an nxagentd log of about 1.8 MB, so the 1 MB tail
// the viewer asks for starts mid-line, as on a real server.
import { Buffer } from 'node:buffer'

const LEVELS = ['*I*', '*D*', '*D*', '*W*', '*I*', '*E*', '*I*', '*D*']
const TAGS = ['comm.listener', 'comm.session', 'db.writer', 'proc.spexec', 'sa.ping', 'ssh']
const MESSAGES = [
  'Incoming connection from 10.0.0.5',
  'Session 12 closed (inactivity timeout)',
  'Database writer: 64 records committed',
  'Process "dhcpd" executed, exit code 0',
  'Ping to 192.168.1.1 failed (timeout)',
  'Cannot connect to SSH host 10.20.0.14: connection refused',
  'Received configuration update from server',
  'Data collection item "System.CPU.Usage" scheduled',
]

function buildLog(lines) {
  const start = Date.UTC(2026, 10, 17, 6, 0, 0)
  const out = []
  for (let i = 0; i < lines; i++) {
    const t = new Date(start + i * 1700)
    const stamp = t.toISOString().replace('T', ' ').replace('Z', '').replaceAll('-', '.')
    const tag = TAGS[i % TAGS.length].padEnd(16)
    out.push(`${stamp} ${LEVELS[i % LEVELS.length]} [${tag}] ${MESSAGES[i % MESSAGES.length]}`)
  }
  return `${out.join('\n')}\n`
}

const LOG = Buffer.from(buildLog(24000), 'utf-8')

export default function handler(req, res) {
  const sizeLimit = Number(new URL(req.url, 'http://mock').searchParams.get('sizeLimit')) || 0
  const body = sizeLimit > 0 && sizeLimit < LOG.length ? LOG.subarray(LOG.length - sizeLimit) : LOG
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}
