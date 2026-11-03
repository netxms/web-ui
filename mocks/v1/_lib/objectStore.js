import fs from 'node:fs'
import path from 'node:path'

// PATCH overrides layered on the static fixtures, keyed by object id, so a PATCH round-trips
// through the object and rack/chassis-layout GET handlers.
const overrides = new Map()

function readBaseObject(id) {
  const filePath = path.resolve('mocks/v1/objects', `${id}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

export function getObject(id) {
  const base = readBaseObject(id)
  const override = overrides.get(id)
  if (!base && !override) return null
  return { ...base, ...override }
}

export function patchObject(id, patch) {
  overrides.set(id, { ...overrides.get(id), ...patch })
  return getObject(id)
}

export function getOverriddenIds() {
  return [...overrides.keys()]
}
