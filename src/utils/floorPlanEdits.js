/**
 * Floor plan editor model: the parts of a floor plan the editor changes, and the WebAPI calls a
 * change needs. Millimetres and degrees as in `floorPlan.js`.
 */

import { backdropImageId } from './floorPlan'

/** DataTransfer type of a rack dragged from the side list onto the plan. */
export const RACK_DRAG_TYPE = 'application/x-netxms-rack'

/** Passive element types (server enum names) with the size a new one gets. */
export const ELEMENT_TYPES = [
  { type: 'COLUMN', label: 'Column', width: 600, depth: 600 },
  { type: 'WALL', label: 'Wall', width: 2400, depth: 200 },
  { type: 'DOOR', label: 'Door', width: 1200, depth: 100 },
  { type: 'RAMP', label: 'Ramp', width: 1800, depth: 1200 },
  { type: 'STAIRS', label: 'Stairs', width: 1200, depth: 2400 },
  { type: 'OTHER', label: 'Other', width: 1200, depth: 600 },
]

export function elementTypeLabel(type) {
  return ELEMENT_TYPES.find((t) => t.type === type)?.label ?? type
}

/** "Column 3": the type's label and the first number no element of the room uses with it. */
export function nextElementName(elements, type) {
  const label = elementTypeLabel(type)
  const used = new Set(elements.map((e) => e.name))
  let n = 1
  while (used.has(`${label} ${n}`)) n++
  return `${label} ${n}`
}

const ELEMENT_FIELDS = ['name', 'x', 'y', 'rotation', 'width', 'depth']
const PLACEMENT_FIELDS = ['placed', 'x', 'y', 'rotation']
/** Fields of the room group the editor changes besides the outline. */
const ROOM_FIELDS = [
  'gridTileSize',
  'gridLabels',
  'backgroundImage',
  'backgroundScale',
  'backgroundX',
  'backgroundY',
]

/** Room fields that place the backdrop image. */
export const BACKDROP_FIELDS = ROOM_FIELDS.slice(2)

/**
 * @typedef {{ placed: boolean, x: number, y: number, rotation: number }} Placement
 * @typedef {{ id: number, name: string, type: string, x: number, y: number, rotation: number,
 *   width: number, depth: number }} Element
 * @typedef {{ gridTileSize: number, gridLabels: string, backgroundImage: string|null,
 *   backgroundScale: number, backgroundX: number, backgroundY: number }} RoomFields
 * @typedef {{ id: number, name: string, status: number, width: number, depth: number,
 *   height?: number, rooms: Array<{id: number, name: string}> }} Arrival - a rack from elsewhere,
 *   bound to the room on save and unbound from `rooms`
 * @typedef {{ outline: Array<{x: number, y: number}>, room: RoomFields, elements: Element[],
 *   placements: Record<number, Placement>, arrivals: Record<number, Arrival> }} EditModel
 */

/** @returns {Placement} */
export function placementOf(rack) {
  return {
    placed: !!rack.placed,
    x: rack.x ?? 0,
    y: rack.y ?? 0,
    rotation: rack.rotation ?? 0,
  }
}

/**
 * @param {object} plan - GET /v1/objects/{id}/floor-plan document
 * @returns {EditModel}
 */
export function editModelFromPlan(plan) {
  return {
    outline: (plan.outline ?? []).map(({ x, y }) => ({ x, y })),
    room: {
      gridTileSize: plan.gridTileSize ?? 0,
      gridLabels: plan.gridLabels ?? 'NONE',
      backgroundImage: backdropImageId(plan),
      backgroundScale: plan.backgroundScale ?? 0,
      backgroundX: plan.backgroundX ?? 0,
      backgroundY: plan.backgroundY ?? 0,
    },
    elements: (plan.passiveElements ?? []).map((e) => ({
      id: e.id,
      name: e.name ?? '',
      type: e.type,
      x: e.x ?? 0,
      y: e.y ?? 0,
      rotation: e.rotation ?? 0,
      width: e.width ?? 0,
      depth: e.depth ?? 0,
    })),
    placements: Object.fromEntries((plan.racks ?? []).map((r) => [r.id, placementOf(r)])),
    arrivals: {},
  }
}

/** Elements the server does not have yet carry a negative id. */
export const isNewElement = (element) => element.id < 0

const pick = (source, fields) => Object.fromEntries(fields.map((field) => [field, source[field]]))

function changedFields(before, after, fields) {
  const payload = {}
  for (const field of fields) {
    if (before[field] !== after[field]) payload[field] = after[field]
  }
  return payload
}

const sameOutline = (a, b) =>
  a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y)

/**
 * The calls that take the server from `baseline` to `working`: the room's outline and grid, each
 * rack's changed placement fields, racks moving in with their whole placement, then element
 * deletes, updates and creates. A rack that has arrived is in the baseline's placements.
 *
 * @param {EditModel} baseline
 * @param {EditModel} working
 * @returns {Array<{ kind: 'room'|'rack'|'rack-arrive'|'element-delete'|'element-update'
 *   |'element-create', id?: number, payload?: object, fromRoomIds?: number[] }>}
 */
export function saveOperations(baseline, working) {
  const ops = []
  const room = changedFields(baseline.room ?? {}, working.room ?? {}, ROOM_FIELDS)
  if (!sameOutline(baseline.outline, working.outline)) {
    room.outline = working.outline.map(({ x, y }) => ({ x, y }))
  }
  if (Object.keys(room).length) ops.push({ kind: 'room', payload: room })
  for (const [id, after] of Object.entries(working.placements)) {
    const before = baseline.placements[id]
    if (!before) continue
    const payload = changedFields(before, after, PLACEMENT_FIELDS)
    if (Object.keys(payload).length) ops.push({ kind: 'rack', id: Number(id), payload })
  }
  for (const [id, arrival] of Object.entries(working.arrivals ?? {})) {
    const placement = working.placements[id]
    if (baseline.placements[id] || !placement) continue
    ops.push({
      kind: 'rack-arrive',
      id: Number(id),
      fromRoomIds: arrival.rooms.map((room) => room.id),
      payload: pick(placement, PLACEMENT_FIELDS),
    })
  }
  const kept = new Map(working.elements.map((e) => [e.id, e]))
  for (const element of baseline.elements) {
    if (!kept.has(element.id)) ops.push({ kind: 'element-delete', id: element.id })
  }
  const saved = new Map(baseline.elements.map((e) => [e.id, e]))
  for (const element of working.elements) {
    const before = saved.get(element.id)
    if (before) {
      const payload = changedFields(before, element, ELEMENT_FIELDS)
      if (Object.keys(payload).length) ops.push({ kind: 'element-update', id: element.id, payload })
    } else if (isNewElement(element)) {
      const { id, ...payload } = element
      ops.push({ kind: 'element-create', id, payload })
    }
  }
  return ops
}

/**
 * `baseline` with one call's success folded in. A created element takes the id the server
 * answered with; `working` gets the same id, returned as `rename` for the caller to apply.
 *
 * @param {EditModel} baseline
 * @param {object} op - from `saveOperations`
 * @param {object} [answer] - the element a create answered with
 * @returns {{ baseline: EditModel, rename?: { from: number, to: number } }}
 */
export function foldSaved(baseline, op, answer) {
  switch (op.kind) {
    case 'room': {
      const { outline, ...room } = op.payload
      return {
        baseline: {
          ...baseline,
          ...(outline ? { outline: outline.map((p) => ({ ...p })) } : {}),
          room: { ...baseline.room, ...room },
        },
      }
    }
    case 'rack': {
      const current = baseline.placements[op.id]
      return {
        baseline: {
          ...baseline,
          placements: { ...baseline.placements, [op.id]: { ...current, ...op.payload } },
        },
      }
    }
    case 'rack-arrive':
      return {
        baseline: { ...baseline, placements: { ...baseline.placements, [op.id]: { ...op.payload } } },
      }
    case 'element-delete':
      return {
        baseline: { ...baseline, elements: baseline.elements.filter((e) => e.id !== op.id) },
      }
    case 'element-update':
      return {
        baseline: {
          ...baseline,
          elements: baseline.elements.map((e) => (e.id === op.id ? { ...e, ...op.payload } : e)),
        },
      }
    case 'element-create': {
      const id = answer?.id
      const element = { ...op.payload, id }
      return {
        baseline: { ...baseline, elements: [...baseline.elements, element] },
        rename: { from: op.id, to: id },
      }
    }
    default:
      return { baseline }
  }
}
