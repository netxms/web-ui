import fs from 'node:fs'
import path from 'node:path'

// PATCH overrides layered on the static fixtures, keyed by object id, so a PATCH round-trips
// through the object and rack/chassis-layout GET handlers.
const overrides = new Map()

// Objects created through POST /v1/objects, which have no fixture file.
const added = new Map()

function readBaseObject(id) {
  const filePath = path.resolve('mocks/v1/objects', `${id}.json`)
  if (!fs.existsSync(filePath)) return added.get(id) ?? null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

export function getObject(id) {
  const base = readBaseObject(id)
  const override = overrides.get(id)
  if (!base && !override) return null
  return { ...base, ...override }
}

/** The fixture, or the created object, without PATCH overrides. */
export function getFixtureObject(id) {
  return readBaseObject(id)
}

export function addObject(object) {
  added.set(object.id, object)
}

/** In creation order, so an object created under another created one comes after it. */
export function getAddedObjects() {
  return [...added.values()]
}

export function patchObject(id, patch) {
  overrides.set(id, { ...overrides.get(id), ...patch })
  return getObject(id)
}

export function getOverriddenIds() {
  return [...overrides.keys()]
}
