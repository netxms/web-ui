/**
 * Editable properties of the data center classes and of a rack's cabinet, as the server's
 * constructors and property groups take them: enums by name, lengths in millimetres, power in
 * watts. Labels and limits are the legacy dialogs' (Create*Dialog, *Properties).
 */

export const POWER_DOMAIN_TYPE_OPTIONS = [
  { value: 'GRID_ENTRY', label: 'Grid entry' },
  { value: 'GENERATOR', label: 'Generator' },
  { value: 'UPS', label: 'UPS' },
  { value: 'PDU', label: 'PDU' },
  { value: 'BUSWAY', label: 'Busway' },
  { value: 'OTHER', label: 'Other' },
]

export const COOLING_ZONE_TYPE_OPTIONS = [
  { value: 'PLANT', label: 'Cooling plant' },
  { value: 'ZONE', label: 'Thermal zone' },
  { value: 'OTHER', label: 'Other' },
]

export const ROOM_TYPE_OPTIONS = [
  { value: 'COMPUTER_ROOM', label: 'Computer room' },
  { value: 'ELECTRICAL', label: 'Electrical room' },
  { value: 'MECHANICAL', label: 'Mechanical room' },
  { value: 'TELECOM', label: 'Telecom room' },
  { value: 'OTHER', label: 'Other' },
]

export const GRID_LABEL_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'LETTERS_NUMBERS', label: 'Letters and numbers (A1, B2, ...)' },
  { value: 'NUMBERS_NUMBERS', label: 'Numbers and numbers (1-1, 2-2, ...)' },
]

/** @param {Array<{value: string, label: string}>} options */
export function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label ?? value ?? ''
}

/** Server limits: `m_feedTag[16]`, `m_providerId` column width. */
export const FEED_TAG_MAX_LENGTH = 15
export const PROVIDER_ID_MAX_LENGTH = 63

export const LIMITS = {
  settlementLag: { min: 0, max: 365 },
  roomSize: { min: 100, max: 1000000 },
  roomHeight: { min: 0, max: 100000 },
  tileSize: { min: 0, max: 10000 },
  gridOrigin: { min: -1000000, max: 1000000 },
  cabinet: { min: 100, max: 5000 },
}

/** Key of each class's property group in the object document and in its URL. */
export const PROPERTY_GROUPS = {
  Facility: { key: 'facility', fields: ['settlementLag', 'providerId'] },
  PowerDomain: { key: 'powerDomain', fields: ['domainType', 'feedTag', 'ratedPower'] },
  CoolingZone: { key: 'coolingZone', fields: ['zoneType', 'ratedCapacity'] },
  Room: {
    key: 'room',
    fields: [
      'roomType',
      'height',
      'gridTileSize',
      'gridLabels',
      'gridOriginX',
      'gridOriginY',
      'backgroundImage',
    ],
  },
}

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

/**
 * Draft copy of a class's property group: the editable fields, plus the room's derived area.
 *
 * @param {string} objectClass
 * @param {object} [group] - the group as the object document carries it
 */
export function adaptPropertyGroup(objectClass, group = {}) {
  switch (objectClass) {
    case 'Facility':
      return { settlementLag: group.settlementLag ?? 5, providerId: group.providerId ?? '' }
    case 'PowerDomain':
      return {
        domainType: group.domainType ?? 'OTHER',
        feedTag: group.feedTag ?? '',
        ratedPower: group.ratedPower ?? 0,
      }
    case 'CoolingZone':
      return { zoneType: group.zoneType ?? 'OTHER', ratedCapacity: group.ratedCapacity ?? 0 }
    case 'Room':
      return {
        roomType: group.roomType ?? 'OTHER',
        height: group.height ?? 0,
        gridTileSize: group.gridTileSize ?? 0,
        gridLabels: group.gridLabels ?? 'NONE',
        gridOriginX: group.gridOriginX ?? 0,
        gridOriginY: group.gridOriginY ?? 0,
        backgroundImage:
          group.backgroundImage && group.backgroundImage !== NULL_GUID
            ? group.backgroundImage
            : null,
        area: group.area ?? null,
      }
    default:
      return null
  }
}

const TEXT_FIELDS = new Set(['providerId', 'feedTag'])

/**
 * Merge patch of the changed fields of an object's property group. Text is trimmed, and empty
 * text goes out as null, which the server takes as "clear".
 *
 * @param {object} draft - adapted object being edited
 * @param {object} orig - adapted object as loaded
 * @returns {{ group: string, payload: object } | null} null when the class has no group or
 *   nothing in it changed
 */
export function propertyGroupPatch(draft, orig) {
  const spec = PROPERTY_GROUPS[draft.class]
  if (!spec) return null
  const next = draft[spec.key] ?? {}
  const prev = orig?.[spec.key] ?? {}
  const payload = {}
  for (const field of spec.fields) {
    let value = next[field]
    if (TEXT_FIELDS.has(field)) value = (value ?? '').trim()
    if (value === (TEXT_FIELDS.has(field) ? (prev[field] ?? '').trim() : prev[field])) continue
    payload[field] = TEXT_FIELDS.has(field) && value === '' ? null : value
  }
  return Object.keys(payload).length ? { group: spec.key, payload } : null
}

/**
 * Cabinet width and depth of a rack, the only rack fields the WebAPI's object PATCH takes.
 *
 * @returns {object} the changed fields, empty when none
 */
export function rackCabinetPatch(draft, orig) {
  if (draft.class !== 'Rack') return {}
  const patch = {}
  for (const field of ['width', 'depth']) {
    if (draft[field] !== orig?.[field]) patch[field] = draft[field]
  }
  return patch
}

/** What the legacy create dialogs start with. */
export function createFormDefaults(objectClass) {
  switch (objectClass) {
    case 'Facility':
      return { settlementLag: 5, providerId: '' }
    case 'PowerDomain':
      return { domainType: 'OTHER', feedTag: '', ratedPower: 0 }
    case 'CoolingZone':
      return { zoneType: 'OTHER', ratedCapacity: 0 }
    case 'Room':
      return { roomType: 'COMPUTER_ROOM' }
    default:
      return {}
  }
}

/**
 * Floor grid of a new room: 600 mm raised-floor tiles labelled A1. The server's create ignores
 * grid fields, so they follow in a PATCH; the shape is the server's default rectangle.
 */
export const NEW_ROOM_GRID = { gridTileSize: 600, gridLabels: 'LETTERS_NUMBERS' }

/**
 * Class-specific fields of a `POST /v1/objects` body. The server's constructors read them at
 * the top level of the document, not inside the property group.
 *
 * @param {string} objectClass
 * @param {object} form - from `createFormDefaults`, edited
 */
export function createPayloadFields(objectClass, form) {
  switch (objectClass) {
    case 'Facility': {
      const providerId = form.providerId.trim()
      return { settlementLag: form.settlementLag, ...(providerId ? { providerId } : {}) }
    }
    case 'PowerDomain': {
      const feedTag = form.feedTag.trim()
      return {
        domainType: form.domainType,
        ratedPower: form.ratedPower,
        ...(feedTag ? { feedTag } : {}),
      }
    }
    case 'CoolingZone':
      return { zoneType: form.zoneType, ratedCapacity: form.ratedCapacity }
    case 'Room':
      return { roomType: form.roomType }
    default:
      return {}
  }
}
