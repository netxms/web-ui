/**
 * Data center classes (Facility, PowerDomain, CoolingZone, Room) and rack room placement.
 * Lengths and coordinates are millimetres in room-local space, Y pointing down; rotation is
 * clockwise degrees around the footprint's reference corner, and a rack's front at rotation 0 is
 * its +Y edge. Enums arrive as names (`COMPUTER_ROOM`, `PDU`, `DOOR`).
 */
import { get, patch, post, put, del } from './client'
import { listDciConfig } from './dciConfigApi'
import { getDciValues, getObject, getRackLayout } from './objectsApi'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'
import { dciValueKey } from '@/utils/dciValues'
import { bindInPlaceOf } from '@/utils/moveToGroup'
import { normalizeRotation, polygonArea } from '@/utils/floorPlan'
import { DEMO_DATA_CENTER } from './demoSeeds'

// The dev mock server serves the same fixtures at their real paths, writes included.
const SERVE_DEMO_SEEDS = DEMO_CONTENT_ENABLED && import.meta.env.VITE_USE_MOCKS !== 'true'

/** @param {number|string} id */
export function isDemoDataCenterId(id) {
  return SERVE_DEMO_SEEDS && DEMO_DATA_CENTER.objects[Number(id)] != null
}

// Floor plan edits of demo rooms: the server has none of these objects, so they live in this tab
// until it reloads. Object id -> property groups that replace the seed's.
const demoEdits = new Map()
// Above every element id in the seed.
let nextDemoElementId = 9001

function demoObject(id) {
  const object = DEMO_DATA_CENTER.objects[Number(id)]
  const edits = demoEdits.get(Number(id))
  return object && edits ? { ...object, ...edits } : object
}

function demoRead(id, read) {
  return Promise.resolve(structuredClone(read(demoObject(id))))
}

function rejectDemoWrite() {
  return Promise.reject(new Error('Demo content cannot be saved to the server'))
}

/** Same derivation as the server's Room::getFloorPlan. */
function demoFloorPlan(room) {
  const racks = room.children
    .map((id) => demoObject(id))
    .filter((child) => child?.class === 'Rack')
    .map((rack) => ({
      ...rack.roomPlacement,
      id: rack.id,
      name: rack.name,
      status: rack.status,
      height: rack.height,
      width: rack.width,
      depth: rack.depth,
    }))
  return { ...room.room, roomId: room.id, name: room.name, racks }
}

/**
 * Room geometry, passive elements and the racks bound to the room that the user can read, each
 * with its footprint, status and `placed` flag (unplaced racks are listed too).
 *
 * @param {number} roomId
 * @param {object} [options] - forwarded to the client (`signal`, `priority`)
 */
export function getFloorPlan(roomId, options) {
  if (isDemoDataCenterId(roomId)) return demoRead(roomId, demoFloorPlan)
  return get(`/v1/objects/${roomId}/floor-plan`, options)
}

function configGroup(urlName, key) {
  return {
    read(id, options) {
      if (isDemoDataCenterId(id)) return demoRead(id, (object) => object[key])
      return get(`/v1/objects/${id}/${urlName}`, options)
    },
    /** Merge patch of the group; answers the whole object document. */
    update(id, payload) {
      if (isDemoDataCenterId(id)) return rejectDemoWrite()
      return patch(`/v1/objects/${id}/${urlName}`, payload)
    },
  }
}

const facility = configGroup('facility', 'facility')
const powerDomain = configGroup('power-domain', 'powerDomain')
const coolingZone = configGroup('cooling-zone', 'coolingZone')
const room = configGroup('room', 'room')
const roomPlacement = configGroup('room-placement', 'roomPlacement')

/** `{ settlementLag, providerId, engineEnabled }`; a null or empty provider disables the KPI engine. */
export const getFacilityConfig = facility.read
export const updateFacilityConfig = facility.update

/** `{ domainType, feedTag, ratedPower }`, rated power in watts (0 = undeclared). */
export const getPowerDomainConfig = powerDomain.read
export const updatePowerDomainConfig = powerDomain.update

/** `{ zoneType, ratedCapacity }`, capacity in watts (0 = undeclared). */
export const getCoolingZoneConfig = coolingZone.read
export const updateCoolingZoneConfig = coolingZone.update

/**
 * Room group. `area` (m²) and `passiveElements` are read-only here: the server derives the area
 * from `outline`, and elements have their own endpoints. A null `backgroundImage` clears it.
 */
export const getRoomConfig = room.read
export const updateRoomConfig = room.update

/** `{ placed, x, y, rotation }` of a rack; the server clears `placed` when the rack leaves the room. */
export const getRackRoomPlacement = roomPlacement.read
export const updateRackRoomPlacement = roomPlacement.update

/** Answers the element with its server-assigned id. */
export function createRoomPassiveElement(roomId, payload) {
  if (isDemoDataCenterId(roomId)) return rejectDemoWrite()
  return post(`/v1/objects/${roomId}/floor-plan/passive-elements`, payload)
}

/** Merge patch; an element's `type` cannot change after creation. */
export function updateRoomPassiveElement(roomId, elementId, payload) {
  if (isDemoDataCenterId(roomId)) return rejectDemoWrite()
  return patch(`/v1/objects/${roomId}/floor-plan/passive-elements/${elementId}`, payload)
}

export function deleteRoomPassiveElement(roomId, elementId) {
  if (isDemoDataCenterId(roomId)) return rejectDemoWrite()
  return del(`/v1/objects/${roomId}/floor-plan/passive-elements/${elementId}`)
}

/** A floor plan call on a demo room, answered as the server would. */
function demoFloorPlanWrite(roomId, op) {
  const room = demoObject(roomId)
  const setGroup = (id, key, value) => demoEdits.set(id, { ...demoEdits.get(id), [key]: value })
  const elements = room.room.passiveElements ?? []
  const setElements = (list) => setGroup(room.id, 'room', { ...room.room, passiveElements: list })
  switch (op.kind) {
    case 'room': {
      const group = { ...room.room, ...op.payload }
      if (op.payload.outline) group.area = polygonArea(op.payload.outline.map((p) => [p.x, p.y]))
      setGroup(room.id, 'room', group)
      return structuredClone(demoObject(room.id))
    }
    case 'rack': {
      const rack = demoObject(op.id)
      const placement = { ...rack.roomPlacement, ...op.payload }
      placement.rotation = normalizeRotation(placement.rotation)
      setGroup(rack.id, 'roomPlacement', placement)
      return structuredClone(demoObject(rack.id))
    }
    case 'element-create': {
      const element = { name: '', x: 0, y: 0, rotation: 0, width: 0, depth: 0, ...op.payload }
      element.id = nextDemoElementId++
      setElements([...elements, element])
      return structuredClone(element)
    }
    case 'element-update': {
      // The type stays as created, as on the server.
      const { type: _type, ...fields } = op.payload
      const element = { ...elements.find((e) => e.id === op.id), ...fields }
      setElements(elements.map((e) => (e.id === op.id ? element : e)))
      return structuredClone(element)
    }
    case 'element-delete':
      setElements(elements.filter((e) => e.id !== op.id))
      return null
    default:
      throw new Error(`Unknown floor plan change: ${op.kind}`)
  }
}

// The editor lists a refused change with the item; a global toast per item would repeat it.
const ITEM_ERRORS = { suppressForbidden: true }

/**
 * A rack from elsewhere into the room. Leaving a room clears the rack's placement flag, so the
 * placement goes last, once the rack stands in this room only.
 */
async function moveRackIntoRoom(roomId, op) {
  await bindInPlaceOf({
    parentId: roomId,
    childId: op.id,
    replacedIds: op.fromRoomIds ?? [],
    bind: ({ parentId, childId }) =>
      put(`/v1/objects/${parentId}/children/${childId}`, undefined, ITEM_ERRORS),
    unbind: ({ parentId, childId }) =>
      del(`/v1/objects/${parentId}/children/${childId}`, ITEM_ERRORS),
    fetchObject: getObject,
  })
  return patch(`/v1/objects/${op.id}/room-placement`, op.payload, ITEM_ERRORS)
}

/**
 * One call of a floor plan save, as `saveOperations` in `floorPlanEdits.js` lists them. The
 * WebAPI has no batch save: each call stands alone. A demo room keeps the change in this tab.
 *
 * @param {number} roomId
 * @param {{ kind: string, id?: number, payload?: object }} op
 */
export function saveFloorPlanOperation(roomId, op) {
  if (isDemoDataCenterId(roomId))
    return Promise.resolve().then(() => demoFloorPlanWrite(roomId, op))
  const elements = `/v1/objects/${roomId}/floor-plan/passive-elements`
  switch (op.kind) {
    case 'room':
      return patch(`/v1/objects/${roomId}/room`, op.payload, ITEM_ERRORS)
    case 'rack':
      return patch(`/v1/objects/${op.id}/room-placement`, op.payload, ITEM_ERRORS)
    case 'rack-arrive':
      return moveRackIntoRoom(roomId, op)
    case 'element-create':
      return post(elements, op.payload, ITEM_ERRORS)
    case 'element-update':
      return patch(`${elements}/${op.id}`, op.payload, ITEM_ERRORS)
    case 'element-delete':
      return del(`${elements}/${op.id}`, ITEM_ERRORS)
    default:
      return Promise.reject(new Error(`Unknown floor plan change: ${op.kind}`))
  }
}

/**
 * DCI configurations of an object. Current values do not carry `systemTag`, so finding a
 * metric by tag needs this list first.
 *
 * @param {number} objectId
 */
export function listObjectDcis(objectId) {
  if (isDemoDataCenterId(objectId)) {
    return demoRead(objectId, () => DEMO_DATA_CENTER.dcis[Number(objectId)] ?? [])
  }
  return listDciConfig(objectId)
}

/**
 * Current values of `{ objectId, dciId }` items, demo and real ones mixed.
 *
 * @param {Array<{objectId: number, dciId: number}>} items
 * @param {object} [options] - forwarded to `getDciValues`
 * @returns {Promise<Record<string, object>>} raw DCIValue rows keyed by `dciValueKey`
 */
export async function getDataCenterValues(items, options) {
  const demo = items.filter((item) => isDemoDataCenterId(item.objectId))
  const real = items.filter((item) => !isDemoDataCenterId(item.objectId))
  const values = real.length ? await getDciValues(real, options) : {}
  for (const item of demo) {
    const row = DEMO_DATA_CENTER.values[item.objectId]?.find((v) => v.id === item.dciId)
    if (row) values[dciValueKey(item)] = structuredClone(row)
  }
  return values
}

/**
 * GET /v1/objects/{id}/rack-layout, demo racks included.
 *
 * @param {number} rackId
 */
export function getDataCenterRackLayout(rackId) {
  if (!isDemoDataCenterId(rackId)) return getRackLayout(rackId)
  return demoRead(rackId, (rack) => ({
    rackId: rack.id,
    name: rack.name,
    height: rack.height,
    topBottomNumbering: rack.topBottomNumbering,
    passiveElements: rack.passiveElements ?? [],
    objects: DEMO_DATA_CENTER.devices[rack.id] ?? [],
  }))
}

/** The demo data center's alarms, as GET /v1/alarms entries; none without demo seeds. */
export function getDemoDataCenterAlarms() {
  return SERVE_DEMO_SEEDS ? structuredClone(DEMO_DATA_CENTER.alarms) : []
}

function demoTreeNode(id) {
  const object = DEMO_DATA_CENTER.objects[id]
  return {
    id,
    guid: object.guid,
    class: object.class,
    name: object.name,
    alias: object.alias,
    status: object.status,
    isInMaintenanceMode: false,
    isMaintenanceApplicable: true,
    children: object.children.filter((child) => DEMO_DATA_CENTER.objects[child]).map(demoTreeNode),
  }
}

/**
 * The demo facilities as GET /v1/objects/{id}/sub-tree nodes rooted at the facility, or none
 * when the mock server already lists them under Infrastructure.
 */
export function getDemoFacilityTrees() {
  if (!SERVE_DEMO_SEEDS) return []
  return Object.values(DEMO_DATA_CENTER.objects)
    .filter((object) => object.class === 'Facility')
    .map((facility) => demoTreeNode(facility.id))
}
