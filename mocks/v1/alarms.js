/**
 * Alternates between 10 and 11 alarms on successive polls so the alarm feed animation fires
 * during development. Remove this file to fall back to the static alarms.json.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseAlarms = JSON.parse(readFileSync(join(__dirname, 'alarms.json'), 'utf-8'))

let callCount = 0

export default function getAlarms() {
  callCount++
  if (callCount % 2 === 0) {
    return [
      ...baseAlarms,
      {
        id: 9999,
        state: 0,
        severity: 4,
        sourceObjectId: 999,
        sourceObjectName: 'srv-demo-01',
        message: 'Demo: CPU utilization exceeded 95% threshold',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ackBy: null,
        ackTime: null,
      },
    ]
  }
  return baseAlarms
}
