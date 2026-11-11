import fs from 'node:fs'
import path from 'node:path'
import { addObject, getAddedObjects, getFixtureObject, getObject, patchObject } from './objectStore.js'

// Server-side handlers for the data center classes (Facility, PowerDomain, CoolingZone, Room) and
// rack room placement: rooms.cpp and object_dc_container_config.cpp in the server's webapi.

const ROOM_TYPES = ['COMPUTER_ROOM', 'ELECTRICAL', 'MECHANICAL', 'TELECOM', 'OTHER']
const GRID_LABELS = ['NONE', 'LETTERS_NUMBERS', 'NUMBERS_NUMBERS']
const ELEMENT_TYPES = ['COLUMN', 'WALL', 'RAMP', 'STAIRS', 'DOOR', 'OTHER']
const POWER_DOMAIN_TYPES = ['GRID_ENTRY', 'GENERATOR', 'UPS', 'PDU', 'BUSWAY', 'OTHER']
const COOLING_ZONE_TYPES = ['PLANT', 'ZONE', 'OTHER']

/** The server accepts an enum as its name (any case) or its index, and sends the name. */
function enumName(value, names) {
  if (typeof value === 'string') return names.find((n) => n === value.toUpperCase()) ?? null
  if (Number.isInteger(value)) return names[value] ?? null
  return null
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(null)
      }
    })
  })
}

function segments(req) {
  return req.url.split('?')[0].split('/').filter(Boolean)
}

/** Object id is the segment after `objects`. */
function objectIdOf(req) {
  const parts = segments(req)
  return Number(parts[parts.indexOf('objects') + 1])
}

function fail(res, status, reason) {
  res.statusCode = status
  return reason ? { reason } : {}
}

function outlineArea(outline) {
  let sum = 0
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2 / 1e6
}

const isInt = (v) => Number.isInteger(v)

/**
 * Group validators: return the merged group, or null for a rejected document. The server
 * rejects the whole document when any property is invalid.
 */
const GROUPS = {
  facility: {
    objectClass: 'Facility',
    merge(current, patch) {
      const next = { ...current }
      if ('settlementLag' in patch) {
        if (!isInt(patch.settlementLag) || patch.settlementLag < 0) return null
        next.settlementLag = patch.settlementLag
      }
      if ('providerId' in patch) {
        if (patch.providerId !== null && typeof patch.providerId !== 'string') return null
        next.providerId = patch.providerId ?? ''
      }
      next.engineEnabled = next.providerId !== ''
      return next
    },
  },
  powerDomain: {
    objectClass: 'PowerDomain',
    merge(current, patch) {
      const next = { ...current }
      if ('domainType' in patch) {
        next.domainType = enumName(patch.domainType, POWER_DOMAIN_TYPES)
        if (!next.domainType) return null
      }
      if ('feedTag' in patch) {
        if (patch.feedTag !== null && typeof patch.feedTag !== 'string') return null
        next.feedTag = (patch.feedTag ?? '').slice(0, 15)
      }
      if ('ratedPower' in patch) {
        if (!isInt(patch.ratedPower) || patch.ratedPower < 0) return null
        next.ratedPower = patch.ratedPower
      }
      return next
    },
  },
  coolingZone: {
    objectClass: 'CoolingZone',
    merge(current, patch) {
      const next = { ...current }
      if ('zoneType' in patch) {
        next.zoneType = enumName(patch.zoneType, COOLING_ZONE_TYPES)
        if (!next.zoneType) return null
      }
      if ('ratedCapacity' in patch) {
        if (!isInt(patch.ratedCapacity) || patch.ratedCapacity < 0) return null
        next.ratedCapacity = patch.ratedCapacity
      }
      return next
    },
  },
  room: {
    objectClass: 'Room',
    merge(current, patch) {
      const next = { ...current }
      if ('roomType' in patch) {
        next.roomType = enumName(patch.roomType, ROOM_TYPES)
        if (!next.roomType) return null
      }
      if ('gridLabels' in patch) {
        next.gridLabels = enumName(patch.gridLabels, GRID_LABELS)
        if (!next.gridLabels) return null
      }
      if ('outline' in patch) {
        const outline = patch.outline
        if (!Array.isArray(outline) || outline.length < 3 || outline.length > 1024) return null
        if (!outline.every((p) => isInt(p?.x) && isInt(p?.y))) return null
        next.outline = outline.map(({ x, y }) => ({ x, y }))
        next.area = outlineArea(next.outline)
      }
      for (const key of ['height', 'gridTileSize', 'backgroundScale']) {
        if (key in patch) {
          if (!isInt(patch[key]) || patch[key] < 0) return null
          next[key] = patch[key]
        }
      }
      for (const key of ['gridOriginX', 'gridOriginY', 'backgroundX', 'backgroundY']) {
        if (key in patch) {
          if (!isInt(patch[key])) return null
          next[key] = patch[key]
        }
      }
      if ('backgroundImage' in patch) {
        if (patch.backgroundImage !== null && typeof patch.backgroundImage !== 'string') return null
        next.backgroundImage = patch.backgroundImage
      }
      return next
    },
  },
  roomPlacement: {
    objectClass: 'Rack',
    merge(current, patch) {
      const next = { ...current }
      for (const key of ['x', 'y']) {
        if (key in patch) {
          if (!isInt(patch[key])) return null
          next[key] = patch[key]
        }
      }
      if ('rotation' in patch) {
        if (!isInt(patch.rotation)) return null
        next.rotation = ((patch.rotation % 360) + 360) % 360
      }
      if ('placed' in patch) {
        if (typeof patch.placed !== 'boolean') return null
        next.placed = patch.placed
      }
      return next
    },
  },
}

/**
 * GET/PATCH /v1/objects/{id}/<group>. GET answers the group, PATCH merges into it and answers the
 * whole object, as ApplyJsonPatch does.
 *
 * @param {keyof typeof GROUPS} key - property group key in the object document
 * @param {string} urlName - group name in the URL, used in the error text
 */
export function groupHandler(key, urlName) {
  const group = GROUPS[key]
  return async function (req, res) {
    const object = getObject(objectIdOf(req))
    if (!object) return fail(res, 404)
    if (object.class !== group.objectClass) {
      return fail(res, 400, `Property group ${urlName} does not apply to object class ${object.class}`)
    }
    if (req.method === 'GET') return object[key]
    if (req.method !== 'PATCH') return fail(res, 405)

    const patch = await readBody(req)
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return fail(res, 400, 'Request body must be a JSON object')
    }
    const merged = group.merge(object[key] ?? {}, patch)
    if (!merged) return fail(res, 400, 'Invalid property values in request')
    return patchObject(object.id, { [key]: merged })
  }
}

/** GET /v1/objects/{id}/floor-plan: the room group plus the room's racks the user can read. */
export function floorPlanHandler(req, res) {
  const room = getObject(objectIdOf(req))
  if (!room) return fail(res, 404)
  if (room.class !== 'Room') return fail(res, 400, 'Object is not a room')

  const racks = (room.children ?? [])
    .map((id) => getObject(id))
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

function loadRoom(req, res) {
  const room = getObject(objectIdOf(req))
  if (!room) return { error: fail(res, 404) }
  if (room.class !== 'Room') return { error: fail(res, 400, 'Object is not a room') }
  return { room }
}

function validElement(body) {
  if ('type' in body && !enumName(body.type, ELEMENT_TYPES)) return false
  return ['width', 'depth'].every((k) => !(k in body) || (isInt(body[k]) && body[k] >= 0))
}

function updateElement(element, body) {
  const next = { ...element }
  if ('name' in body) next.name = String(body.name ?? '')
  for (const key of ['x', 'y', 'rotation', 'width', 'depth']) {
    if (isInt(body[key])) next[key] = body[key]
  }
  return next
}

function savePassiveElements(room, passiveElements) {
  patchObject(room.id, { room: { ...room.room, passiveElements } })
}

// Above every element id in the fixtures; the server allocates them from one global sequence.
let nextElementId = 1000

/** POST /v1/objects/{id}/floor-plan/passive-elements. */
export async function createPassiveElement(req, res) {
  const { room, error } = loadRoom(req, res)
  if (error) return error
  const body = await readBody(req)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(res, 400, 'Request body must be a JSON object')
  }
  if (!validElement(body)) return fail(res, 400, 'Invalid passive element definition')

  const element = updateElement(
    {
      id: nextElementId++,
      name: '',
      type: enumName(body.type, ELEMENT_TYPES) ?? 'OTHER',
      x: 0,
      y: 0,
      rotation: 0,
      width: 0,
      depth: 0,
    },
    body,
  )
  savePassiveElements(room, [...(room.room.passiveElements ?? []), element])
  res.statusCode = 201
  res.setHeader('Location', `/v1/objects/${room.id}/floor-plan/passive-elements/${element.id}`)
  return element
}

/** PATCH and DELETE /v1/objects/{id}/floor-plan/passive-elements/{element-id}. Type is immutable. */
export async function changePassiveElement(req, res) {
  const { room, error } = loadRoom(req, res)
  if (error) return error
  const elementId = Number(segments(req).at(-1))
  const elements = room.room.passiveElements ?? []
  const index = elements.findIndex((e) => e.id === elementId)

  if (req.method === 'DELETE') {
    if (index < 0) return fail(res, 404)
    savePassiveElements(
      room,
      elements.filter((e) => e.id !== elementId),
    )
    res.statusCode = 204
    res.end()
    return undefined
  }
  if (req.method !== 'PATCH') return fail(res, 405)

  const body = await readBody(req)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(res, 400, 'Request body must be a JSON object')
  }
  if (!validElement(body)) return fail(res, 400, 'Invalid passive element definition')
  if (index < 0) return fail(res, 404)
  const element = updateElement(elements[index], body)
  savePassiveElements(room, elements.toSpliced(index, 1, element))
  return element
}

// Devices mounted in the demo racks, by rack id, as rack-layout lists them. They have no fixture
// of their own: GET /v1/objects/{id} answers a bare object for each.
const MOUNTED = JSON.parse(
  fs.readFileSync(path.resolve('mocks/v1/_lib/dataCenterDevices.json'), 'utf-8'),
)
const MOUNTED_BY_ID = new Map(
  Object.entries(MOUNTED).flatMap(([rackId, devices]) =>
    devices.map((device) => [device.id, { ...device, rackId: Number(rackId) }]),
  ),
)

/**
 * GET /v1/objects/{id}/rack-layout for racks whose fixture is in the current server shape
 * (`passiveElements` on the object).
 */
export function rackLayoutHandler(req, res) {
  const rack = getObject(objectIdOf(req))
  if (!rack || rack.class !== 'Rack' || !Array.isArray(rack.passiveElements)) return fail(res, 404)
  return {
    rackId: rack.id,
    name: rack.name,
    height: rack.height,
    topBottomNumbering: rack.topBottomNumbering,
    passiveElements: rack.passiveElements,
    objects: MOUNTED[rack.id] ?? [],
  }
}

function mountedObject(device) {
  return {
    id: device.id,
    guid: `mock-${device.id}`,
    class: device.objectClass === 28 ? 'Chassis' : 'Node',
    name: device.name,
    alias: '',
    category: 0,
    comments: '',
    commentsSource: '',
    status: device.status,
    timestamp: '2026-11-09T09:55:00.000Z',
    creationTime: '2026-11-09T09:55:00.000Z',
    customAttributes: [],
    responsibleUsers: [],
    trustedObjects: [],
    accessList: [],
    inheritAccessRights: true,
    children: [],
    parents: [device.rackId],
    physicalPlacement: {
      containerId: device.rackId,
      position: device.rackPosition,
      height: device.rackHeight,
      orientation: device.rackOrientation,
      imageFront: device.rackImageFront,
      imageRear: device.rackImageRear,
    },
  }
}

const DATA_CENTER_CLASSES = new Set(['Facility', 'PowerDomain', 'CoolingZone', 'Room'])

// Objects whose PATCHes read back. Others keep their fixture: the demo image serves these mocks
// to every visitor.
const ROUND_TRIP_CLASSES = new Set([...DATA_CENTER_CLASSES, 'Rack'])

/** GET /v1/objects/{id}. */
export function objectHandler(req, res) {
  const id = Number(segments(req).at(-1))
  const object = Number.isInteger(id) ? getObject(id) : null
  if (!object) return MOUNTED_BY_ID.has(id) ? mountedObject(MOUNTED_BY_ID.get(id)) : fail(res, 404)
  return ROUND_TRIP_CLASSES.has(object.class) ? object : getFixtureObject(id)
}

const nonNegative = (value, fallback) => (isInt(value) && value >= 0 ? value : fallback)
const positive = (value, fallback) => (isInt(value) && value > 0 ? value : fallback)

/** The class's own fields of a new object, as the server's JSON constructors set them. */
function createdFields(body) {
  switch (body.class) {
    case 'Facility': {
      const providerId = typeof body.providerId === 'string' ? body.providerId : ''
      return {
        facility: {
          settlementLag: nonNegative(body.settlementLag, 5),
          providerId,
          engineEnabled: providerId !== '',
        },
      }
    }
    case 'PowerDomain':
      return {
        powerDomain: {
          domainType: enumName(body.domainType, POWER_DOMAIN_TYPES) ?? 'OTHER',
          feedTag: typeof body.feedTag === 'string' ? body.feedTag.slice(0, 15) : '',
          ratedPower: isInt(body.ratedPower) ? body.ratedPower : 0,
        },
      }
    case 'CoolingZone':
      return {
        coolingZone: {
          zoneType: enumName(body.zoneType, COOLING_ZONE_TYPES) ?? 'OTHER',
          ratedCapacity: isInt(body.ratedCapacity) ? body.ratedCapacity : 0,
        },
      }
    case 'Room': {
      const width = positive(body.width, 6000)
      const depth = positive(body.depth, 6000)
      const outline = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ]
      return {
        room: {
          roomType: enumName(body.roomType, ROOM_TYPES) ?? 'OTHER',
          outline,
          area: outlineArea(outline),
          height: nonNegative(body.height, 0),
          gridOriginX: 0,
          gridOriginY: 0,
          gridTileSize: 0,
          gridLabels: 'NONE',
          backgroundImage: null,
          backgroundScale: 0,
          backgroundX: 0,
          backgroundY: 0,
          passiveElements: [],
        },
      }
    }
    case 'Rack':
      return {
        height: positive(body.height, 42),
        topBottomNumbering: false,
        width: positive(body.width, 600),
        depth: positive(body.depth, 1000),
        passiveElements: [],
        roomPlacement: { placed: false, x: 0, y: 0, rotation: 0 },
      }
    default:
      return {}
  }
}

/**
 * A data center object, or any object created under one, in server shape; null for every other
 * create, which the caller answers without keeping it. The parent lists the new child by id, as
 * the fixtures do.
 *
 * @param {object} body - POST /v1/objects document, already checked for name and class
 * @param {number} id
 */
export function createDataCenterObject(body, id) {
  const parent = getObject(body.parentId)
  const underDataCenter = parent && DATA_CENTER_CLASSES.has(parent.class)
  if (!DATA_CENTER_CLASSES.has(body.class) && !underDataCenter) return null

  const object = {
    id,
    guid: `mock-${id}`,
    class: body.class,
    name: body.name,
    alias: body.alias ?? '',
    category: 0,
    comments: '',
    commentsSource: '',
    status: 0,
    timestamp: new Date().toISOString(),
    creationTime: new Date().toISOString(),
    customAttributes: [],
    responsibleUsers: [],
    trustedObjects: [],
    accessList: [],
    inheritAccessRights: true,
    children: [],
    parents: parent ? [parent.id] : [],
    ...createdFields(body),
  }
  addObject(object)
  if (underDataCenter) patchObject(parent.id, { children: [...(parent.children ?? []), id] })
  return object
}

/** Sub-tree node of an object, as the server's summary JSON has it. */
function treeNode(object) {
  return {
    id: object.id,
    guid: object.guid,
    class: object.class,
    name: object.name,
    alias: object.alias,
    category: 0,
    timestamp: object.timestamp,
    status: object.status,
    isInMaintenanceMode: false,
    isMaintenanceApplicable: true,
    children: [],
  }
}

/** GET /v1/objects/{id}/sub-tree: the fixture, with created objects under every copy of their parent. */
export function subTreeHandler(req, res) {
  const rootId = objectIdOf(req)
  const file = path.resolve('mocks/v1/objects', String(rootId), 'sub-tree.json')
  if (!fs.existsSync(file)) return fail(res, 404)
  const tree = JSON.parse(fs.readFileSync(file, 'utf-8'))

  for (const object of getAddedObjects()) {
    const parentId = object.parents[0]
    if (parentId === rootId) tree.push(treeNode(object))
    const graft = (nodes) => {
      for (const node of nodes) {
        if (node.id === parentId) node.children = [...(node.children ?? []), treeNode(object)]
        else graft(node.children ?? [])
      }
    }
    graft(tree)
  }
  return tree
}
