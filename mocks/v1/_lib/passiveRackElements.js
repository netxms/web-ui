import fs from 'node:fs'
import path from 'node:path'

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

// In-memory CRUD for rack 800's passive elements (no backing object).
const created = new Map()
const updates = new Map()
const deleted = new Set()
let nextId = null

function baseElements() {
  const filePath = path.resolve('mocks/v1/objects/800/rack-layout.json')
  const base = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return base.passiveElements ?? []
}

function ensureNextId() {
  if (nextId != null) return
  const ids = baseElements().map((el) => el.id)
  nextId = (ids.length ? Math.max(...ids) : 0) + 1
}

export function listPassiveElements() {
  const base = baseElements()
    .filter((el) => !deleted.has(el.id))
    .map((el) => ({ ...el, ...updates.get(el.id) }))
  const newlyCreated = [...created.values()].filter((el) => !deleted.has(el.id))
  return [...base, ...newlyCreated]
}

export function createPassiveElement(payload) {
  ensureNextId()
  const id = nextId++
  const element = {
    id,
    name: payload.name || '',
    type: payload.type ?? 1,
    position: payload.position ?? 0,
    height: payload.height ?? 1,
    orientation: payload.orientation ?? 0,
    portCount: payload.portCount ?? 0,
    imageFront: payload.imageFront || NULL_GUID,
    imageRear: payload.imageRear || NULL_GUID,
  }
  created.set(id, element)
  return element
}

// Merge-patch; `type` is immutable once created, as on the server.
export function updatePassiveElement(id, payload) {
  const patch = {}
  for (const key of ['name', 'position', 'height', 'orientation', 'portCount']) {
    if (key in payload) patch[key] = payload[key]
  }
  if ('imageFront' in payload) patch.imageFront = payload.imageFront || NULL_GUID
  if ('imageRear' in payload) patch.imageRear = payload.imageRear || NULL_GUID

  if (created.has(id)) {
    created.set(id, { ...created.get(id), ...patch })
    return created.get(id)
  }
  updates.set(id, { ...updates.get(id), ...patch })
  return listPassiveElements().find((el) => el.id === id) ?? null
}

export function deletePassiveElement(id) {
  deleted.add(id)
}
