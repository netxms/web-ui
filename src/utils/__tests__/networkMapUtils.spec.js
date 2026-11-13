import { describe, it, expect, afterEach } from 'vitest'
import { useTheme } from '@/composables/useTheme'
import {
  getLinkColor,
  getLinkDash,
  getLinkWidth,
  getHeatmapColor,
  getHeatmapWidth,
  getDecorations,
  getCanvasBackground,
  DEFAULT_LINK_COLOR,
  LINK_TYPES,
  collectDescendantMaps,
  collectDescendantGroups,
  resolveLinkColor,
  linkStatus,
  getLinkUtilizationColor,
  linkLabelFraction,
  linkDciLines,
  linkDataDirection,
  linkDirectionOptions,
  formatMapDciValue,
  dciContainerLines,
  bendPointsToSegments,
  snapCoord,
  snapPoint,
  resolveMapRenderOptions,
  resolveMapBackdrop,
  backgroundFitModeFromFlags,
  flagsWithBackgroundFitMode,
  resizeBackdropPage,
  MAP_BACKGROUND_FIT_MODES,
  DEFAULT_GEO_BACKDROP_PAGE,
  DEFAULT_MAP_FLAGS,
  MAP_FLAGS,
  GRID_SIZE,
  MAP_TYPE_GEO,
  linkDefaultsChanged,
  isGeographicalCanvas,
  mapInitialView,
  countUnplacedObjects,
} from '@/utils/networkMapUtils'
import {
  adaptApiNetworkMap,
  MAP_LINK_COLOR_SOURCES,
  MAP_BACKGROUND_NONE,
  MAP_BACKGROUND_GEOMAP,
} from '@/utils/networkMapAdapters'
import { getStatusHexColor } from '@/utils/objectUtils'

describe('getLinkColor', () => {
  it('returns customColor when color is "custom"', () => {
    expect(getLinkColor({ color: 'custom', customColor: '#ff0000', type: 0 })).toBe('#ff0000')
  })

  it('returns DEFAULT_LINK_COLOR for color="status"', () => {
    expect(getLinkColor({ color: 'status', type: 0 })).toBe(DEFAULT_LINK_COLOR)
  })

  it('returns type-specific color for AGENT_TUNNEL', () => {
    const color = getLinkColor({ color: 'default', type: LINK_TYPES.AGENT_TUNNEL })
    expect(color).not.toBe(DEFAULT_LINK_COLOR)
    expect(color).toMatch(/^#/)
  })

  it('returns type-specific color for AGENT_PROXY', () => {
    const color = getLinkColor({ color: 'default', type: LINK_TYPES.AGENT_PROXY })
    expect(color).toMatch(/^#/)
    expect(color).not.toBe(DEFAULT_LINK_COLOR)
  })

  it('returns type-specific color for SSH_PROXY', () => {
    expect(getLinkColor({ color: 'default', type: LINK_TYPES.SSH_PROXY })).toMatch(/^#/)
  })

  it('returns type-specific color for SNMP_PROXY', () => {
    expect(getLinkColor({ color: 'default', type: LINK_TYPES.SNMP_PROXY })).toMatch(/^#/)
  })

  it('returns DEFAULT_LINK_COLOR for NORMAL type', () => {
    expect(getLinkColor({ color: 'default', type: LINK_TYPES.NORMAL })).toBe(DEFAULT_LINK_COLOR)
  })

  it('returns DEFAULT_LINK_COLOR for VPN type (no type-specific color)', () => {
    expect(getLinkColor({ color: 'default', type: LINK_TYPES.VPN })).toBe(DEFAULT_LINK_COLOR)
  })
})

function linkWith(colorSource, { interfaces = [], objects = [], ...rest } = {}) {
  return { type: 0, colorSource, statusSources: { interfaces, objects }, ...rest }
}

describe('resolveLinkColor', () => {
  describe('interface status', () => {
    it('uses the more critical of the two endpoint interfaces', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS, {
        interfaces: [{ status: 0 }, { status: 4 }],
      })
      expect(resolveLinkColor(link, null)).toBe(getStatusHexColor(4))
    })

    it('ignores UNKNOWN and above when picking the most critical status', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS, {
        interfaces: [{ status: 1 }, { status: 7 }],
      })
      expect(resolveLinkColor(link, null)).toBe(getStatusHexColor(1))
    })

    it('returns null when no interface could be resolved', () => {
      expect(resolveLinkColor(linkWith(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS), null)).toBeNull()
    })

    it('returns null when every resolved interface is UNKNOWN', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS, {
        interfaces: [{ status: 5 }, { status: 5 }],
      })
      expect(resolveLinkColor(link, null)).toBeNull()
    })
  })

  describe('object status', () => {
    it('takes the most critical status in the object list', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.OBJECT_STATUS, {
        objects: [{ status: 0 }, { status: 3 }, { status: 1 }],
      })
      expect(resolveLinkColor(link, null)).toBe(getStatusHexColor(3))
    })

    it('substitutes a utilization color when useInterfaceUtilization is set', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.OBJECT_STATUS, {
        objects: [{ status: 0 }],
        interfaces: [{ status: 0, utilization: 900 }],
        useInterfaceUtilization: true,
      })
      expect(resolveLinkColor(link, null)).toBe(getLinkUtilizationColor(900))
    })

    it('keeps the critical status rather than substituting utilization', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.OBJECT_STATUS, {
        objects: [{ status: 4 }],
        interfaces: [{ status: 4, utilization: 900 }],
        useInterfaceUtilization: true,
      })
      expect(resolveLinkColor(link, null)).toBe(getStatusHexColor(4))
    })
  })

  describe('utilization', () => {
    it('buckets by the highest outbound utilization of the two interfaces', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.LINK_UTILIZATION, {
        interfaces: [{ utilization: 50 }, { utilization: 900 }],
      })
      expect(resolveLinkColor(link, null)).toBe(getLinkUtilizationColor(900))
    })

    it('treats the server\'s -1 "never measured" as no data', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.LINK_UTILIZATION, {
        interfaces: [{ utilization: -1 }],
      })
      expect(resolveLinkColor(link, null)).toBeNull()
    })
  })

  describe('custom and script', () => {
    it('uses the resolved color for CUSTOM', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.CUSTOM, { customColor: '#123456' })
      expect(resolveLinkColor(link, null)).toBe('#123456')
    })

    it('uses the server-computed color for SCRIPT', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.SCRIPT, { customColor: '#abcdef' })
      expect(resolveLinkColor(link, null)).toBe('#abcdef')
    })
  })

  describe('default source', () => {
    it('delegates to the map default color source when it is interface status', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.DEFAULT, { interfaces: [{ status: 4 }] })
      const mapContent = { defaultLinkColorSource: MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS }
      expect(resolveLinkColor(link, mapContent)).toBe(getStatusHexColor(4))
    })

    it('prefers the link type color for proxy/tunnel links', () => {
      const link = linkWith(MAP_LINK_COLOR_SOURCES.DEFAULT, { type: LINK_TYPES.AGENT_TUNNEL })
      expect(resolveLinkColor(link, {})).toBe(getLinkColor({ type: LINK_TYPES.AGENT_TUNNEL }))
    })

    it('falls back to the map default color (BGR int) for plain links', () => {
      // BGR: red in the low byte, so 0x0000ff is pure red.
      expect(resolveLinkColor(linkWith(0), { defaultLinkColor: 255 })).toBe('#ff0000')
    })

    it('returns null when the map has no default color configured', () => {
      expect(resolveLinkColor(linkWith(0), {})).toBeNull()
    })
  })
})

describe('getLinkUtilizationColor', () => {
  it('returns the idle color below the first threshold', () => {
    expect(getLinkUtilizationColor(0)).toBe('#c0c0c0')
  })

  it('returns the saturated color at 100%', () => {
    expect(getLinkUtilizationColor(1000)).toBe('#f90010')
  })

  it('moves to the next bucket exactly at a threshold', () => {
    expect(getLinkUtilizationColor(99)).not.toBe(getLinkUtilizationColor(100))
  })

  it('clamps above the last threshold rather than running off the table', () => {
    expect(getLinkUtilizationColor(5000)).toBe('#f90010')
  })
})

describe('bendPointsToSegments', () => {
  /** Cytoscape's inverse: base + vectorNormInverse * d, vectorNormInverse = {-dy/l, dx/l}. */
  function cytoscapePoint(source, target, weight, distance) {
    const dx = target.x - source.x
    const dy = target.y - source.y
    const l = Math.hypot(dx, dy)
    return {
      x: source.x + dx * weight + (-dy / l) * distance,
      y: source.y + dy * weight + (dx / l) * distance,
    }
  }

  it('round-trips a bend point below a horizontal link', () => {
    const s = { x: 0, y: 0 }
    const t = { x: 100, y: 0 }
    const bend = { x: 50, y: 30 }
    const { weights, distances } = bendPointsToSegments([bend], s, t)
    const back = cytoscapePoint(s, t, weights[0], distances[0])
    expect(back.x).toBeCloseTo(bend.x)
    expect(back.y).toBeCloseTo(bend.y)
  })

  it('round-trips a bend point above a horizontal link', () => {
    const s = { x: 0, y: 0 }
    const t = { x: 100, y: 0 }
    const bend = { x: 20, y: -45 }
    const { weights, distances } = bendPointsToSegments([bend], s, t)
    const back = cytoscapePoint(s, t, weights[0], distances[0])
    expect(back.x).toBeCloseTo(bend.x)
    expect(back.y).toBeCloseTo(bend.y)
  })

  it('round-trips bend points on a diagonal link', () => {
    const s = { x: 10, y: 90 }
    const t = { x: 210, y: -40 }
    const bends = [
      { x: 60, y: 20 },
      { x: 150, y: 40 },
    ]
    const { weights, distances } = bendPointsToSegments(bends, s, t)
    bends.forEach((bend, i) => {
      const back = cytoscapePoint(s, t, weights[i], distances[i])
      expect(back.x).toBeCloseTo(bend.x)
      expect(back.y).toBeCloseTo(bend.y)
    })
  })

  it('signs the offset so a bend below the line is positive (y grows downward)', () => {
    const { distances } = bendPointsToSegments([{ x: 50, y: 30 }], { x: 0, y: 0 }, { x: 100, y: 0 })
    expect(distances[0]).toBeCloseTo(30)
  })

  it('returns null with no bend points', () => {
    expect(bendPointsToSegments([], { x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull()
    expect(bendPointsToSegments(undefined, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull()
  })

  it('returns null when the endpoints coincide', () => {
    expect(bendPointsToSegments([{ x: 5, y: 5 }], { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull()
  })
})

// Thin space: the desktop DataFormatter's separator before a unit.
const T = '\u2009'

describe('linkDciLines', () => {
  const values = new Map([
    ['10:100', { value: '42', unitName: 'Mbps' }],
    ['10:101', { value: '7' }],
    ['10:102', { value: '' }],
  ])
  const line = (text, direction = 'NONE') => [{ text, direction }]

  it('joins every DCI at one location into a single stacked box', () => {
    const link = {
      dciList: [
        { nodeId: 10, dciId: 100, location: 'CENTER' },
        { nodeId: 10, dciId: 101, location: 'CENTER' },
      ],
    }
    expect(linkDciLines(link, 'CENTER', values)).toEqual([line(`42${T}Mbps`), line('7')])
  })

  it('keeps locations separate', () => {
    const link = {
      dciList: [
        { nodeId: 10, dciId: 100, location: 'OBJECT1' },
        { nodeId: 10, dciId: 101, location: 'OBJECT2' },
      ],
    }
    expect(linkDciLines(link, 'OBJECT1', values)).toEqual([line(`42${T}Mbps`)])
    expect(linkDciLines(link, 'OBJECT2', values)).toEqual([line('7')])
  })

  it('treats a missing location as CENTER (the enum zero value)', () => {
    const link = { dciList: [{ nodeId: 10, dciId: 100 }] }
    expect(linkDciLines(link, 'CENTER', values)).toEqual([line(`42${T}Mbps`)])
  })

  it('carries each data source direction onto its line', () => {
    const link = {
      dciList: [
        { nodeId: 10, dciId: 100, direction: 'FORWARD' },
        { nodeId: 10, dciId: 101, direction: 'REVERSE' },
      ],
    }
    expect(linkDciLines(link, 'CENTER', values)).toEqual([
      line(`42${T}Mbps`, 'FORWARD'),
      line('7', 'REVERSE'),
    ])
  })

  it('applies the data source format string', () => {
    const link = { dciList: [{ nodeId: 10, dciId: 101, formatString: 'TX %s' }] }
    expect(linkDciLines(link, 'CENTER', values)).toEqual([line('TX 7')])
  })

  it('skips a value that formats to nothing but keeps the loading placeholder', () => {
    const link = {
      dciList: [
        { nodeId: 10, dciId: 102 },
        { nodeId: 10, dciId: 999, direction: 'FORWARD' },
      ],
    }
    expect(linkDciLines(link, 'CENTER', values)).toEqual([line('...', 'FORWARD')])
  })

  it('labels a table cell with its own value', () => {
    const cell = { nodeId: 10, dciId: 103, type: 2, column: 'IfInOctets', instance: '3' }
    const withCell = new Map([['10:103:["IfInOctets","3"]', { value: '500' }]])
    expect(linkDciLines({ dciList: [cell] }, 'CENTER', withCell)).toEqual([line('500')])
  })

  it('returns an empty list for a link with no DCIs', () => {
    expect(linkDciLines({}, 'CENTER', values)).toEqual([])
  })
})

describe('linkDataDirection', () => {
  it('keeps FORWARD and REVERSE and reads anything else as NONE', () => {
    expect(linkDataDirection('FORWARD')).toBe('FORWARD')
    expect(linkDataDirection('REVERSE')).toBe('REVERSE')
    expect(linkDataDirection('NONE')).toBe('NONE')
    expect(linkDataDirection(undefined)).toBe('NONE')
    expect(linkDataDirection(1)).toBe('NONE')
  })
})

describe('dciContainerLines', () => {
  const values = new Map([
    ['10:100', { value: '42', unitName: 'Mbps' }],
    ['10:101', { value: '7' }],
  ])

  it('renders one line per configured data source, in order', () => {
    const el = {
      dciList: [
        { nodeId: 10, dciId: 100 },
        { nodeId: 10, dciId: 101, formatString: 'n=%s' },
      ],
    }
    expect(dciContainerLines(el, values)).toEqual([`42${T}Mbps`, 'n=7'])
  })

  it('falls back to the legacy "No value" text with no data sources', () => {
    expect(dciContainerLines({ dciList: [] }, values)).toEqual(['No value'])
    expect(dciContainerLines({}, values)).toEqual(['No value'])
  })

  it('marks a failed collection with the reason-specific error marker', () => {
    const el = { dciList: [{ nodeId: 10, dciId: 999 }] }
    const failing = new Map([
      ['10:999', { value: '0', errorCount: 2, lastCollectionError: 'COMM_ERROR' }],
    ])
    expect(dciContainerLines(el, failing)).toEqual(['<< COMM ERROR >>'])
  })
})

describe('formatMapDciValue', () => {
  it('appends the unit when present', () => {
    expect(formatMapDciValue({ value: '42', unitName: 'Mbps' })).toBe(`42${T}Mbps`)
  })

  it('omits the unit when absent', () => {
    expect(formatMapDciValue({ value: '42' })).toBe('42')
  })

  it('applies the format string, multipliers included', () => {
    const traffic = { value: '1240', dataType: 2, unitName: 'B/s' }
    expect(formatMapDciValue(traffic, '%{u,m}s')).toMatch(/^1[.,]24\u2009kB\/s$/)
  })

  it('shows the reason-specific error marker when collection failed', () => {
    expect(
      formatMapDciValue({ value: '0', errorCount: 3, lastCollectionError: 'NO_SUCH_INSTANCE' }),
    ).toBe('<< NO SUCH INSTANCE >>')
    expect(
      formatMapDciValue({ value: '0', errorCount: 3, lastCollectionError: 'INVALID_DATA' }),
    ).toBe('<< INVALID DATA >>')
  })

  it('falls back to the generic marker when the server sends no reason', () => {
    expect(formatMapDciValue({ value: '0', errorCount: 3 })).toBe('<< ERROR >>')
  })

  it('shows a placeholder while the value has not arrived yet', () => {
    expect(formatMapDciValue(undefined)).toBe('...')
  })

  it('shows the mapped value instead of the formatted one', () => {
    expect(formatMapDciValue({ value: '2', unitName: 'Mbps', mappedValue: 'down' })).toBe('down')
  })

  it('still shows the error marker for a mapped value when collection failed', () => {
    expect(formatMapDciValue({ value: '2', errorCount: 1, mappedValue: 'down' })).toBe(
      '<< ERROR >>',
    )
  })
})

describe('getLinkDash', () => {
  it('returns "8 4" for VPN links', () => {
    expect(getLinkDash({ type: LINK_TYPES.VPN })).toBe('8 4')
  })

  it('returns "0" for MULTILINK', () => {
    expect(getLinkDash({ type: LINK_TYPES.MULTILINK })).toBe('0')
  })

  it('returns "0" for NORMAL links', () => {
    expect(getLinkDash({ type: LINK_TYPES.NORMAL })).toBe('0')
  })
})

describe('getLinkWidth', () => {
  it('returns 4 for MULTILINK', () => {
    expect(getLinkWidth({ type: LINK_TYPES.MULTILINK })).toBe(4)
  })

  it('returns 2 for NORMAL', () => {
    expect(getLinkWidth({ type: LINK_TYPES.NORMAL })).toBe(2)
  })

  it('returns 2 for VPN', () => {
    expect(getLinkWidth({ type: LINK_TYPES.VPN })).toBe(2)
  })
})

describe('getHeatmapColor', () => {
  it('returns green at 0% utilization', () => {
    expect(getHeatmapColor(0, 100)).toBe('#22c55e')
  })

  it('returns exact green for maxValue=0 (degenerate case)', () => {
    expect(getHeatmapColor(0, 0)).toBe('#22c55e')
  })

  it('returns exact red at 100% utilization', () => {
    expect(getHeatmapColor(100, 100)).toBe('#ef4444')
  })

  it('returns a hex color at 50%', () => {
    const color = getHeatmapColor(50, 100)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(color).toBe('#eab308')
  })

  it('returns a hex color at 80%', () => {
    const color = getHeatmapColor(80, 100)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(color).toBe('#f97316')
  })

  it('clamps values above maxValue to red', () => {
    expect(getHeatmapColor(200, 100)).toBe('#ef4444')
  })

  it('returns a value between green and yellow at 25%', () => {
    const color = getHeatmapColor(25, 100)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(color).not.toBe('#22c55e')
    expect(color).not.toBe('#eab308')
  })
})

describe('getHeatmapWidth', () => {
  it('returns 2 at 0%', () => {
    expect(getHeatmapWidth(0, 100)).toBe(2)
  })

  it('returns 6 at 100%', () => {
    expect(getHeatmapWidth(100, 100)).toBe(6)
  })

  it('returns 2 for maxValue=0 (degenerate)', () => {
    expect(getHeatmapWidth(0, 0)).toBe(2)
  })

  it('returns a value between 2 and 6 at 50%', () => {
    const w = getHeatmapWidth(50, 100)
    expect(w).toBeGreaterThan(2)
    expect(w).toBeLessThan(6)
  })

  it('clamps above maxValue to 6', () => {
    expect(getHeatmapWidth(200, 100)).toBe(6)
  })
})

describe('getDecorations', () => {
  it('returns only decoration elements', () => {
    const elements = [
      { id: 'e-1', type: 'object' },
      { id: 'e-2', type: 'decoration' },
    ]
    const decs = getDecorations(elements)
    expect(decs).toHaveLength(1)
    expect(decs[0].id).toBe('e-2')
  })

  it('returns empty array when no decorations', () => {
    expect(getDecorations([{ id: 'e-1', type: 'object' }])).toEqual([])
  })
})

describe('getCanvasBackground', () => {
  afterEach(() => {
    useTheme().setTheme('light')
  })

  it('returns default color for null/undefined background', () => {
    expect(getCanvasBackground(null)).toBe('var(--p-surface-ground)')
    expect(getCanvasBackground(undefined)).toBe('var(--p-surface-ground)')
  })

  it('returns color when background type is "color"', () => {
    expect(getCanvasBackground({ type: 'color', color: '#112233' })).toBe('#112233')
  })

  it('returns default for unknown background type', () => {
    expect(getCanvasBackground({ type: 'image', url: 'x' })).toBe('var(--p-surface-ground)')
  })

  it('inverts a light configured color for dark mode', () => {
    useTheme().setTheme('dark')
    expect(getCanvasBackground({ type: 'color', color: '#ffffff' })).toBe('#141414')
  })

  it('leaves an already-dark configured color untouched in dark mode', () => {
    useTheme().setTheme('dark')
    expect(getCanvasBackground({ type: 'color', color: '#112233' })).toBe('#112233')
  })
})

describe('adaptApiNetworkMap', () => {
  function makeRawMap(overrides = {}) {
    return {
      id: 600,
      name: 'Test Map',
      mapType: 0,
      backgroundColor: null,
      elements: [],
      links: [],
      ...overrides,
    }
  }

  it('returns id and name from raw map', () => {
    const result = adaptApiNetworkMap(makeRawMap(), new Map())
    expect(result.id).toBe(600)
    expect(result.name).toBe('Test Map')
  })

  it('returns empty elements and links for empty input', () => {
    const result = adaptApiNetworkMap(makeRawMap(), new Map())
    expect(result.elements).toEqual([])
    expect(result.links).toEqual([])
  })

  it('converts MAP_ELEMENT_OBJECT (type=1) to internal element', () => {
    const raw = makeRawMap({
      elements: [{ id: 1, type: 1, objectId: 42, posX: 10, posY: 20 }],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0]).toMatchObject({
      id: 'e-1',
      type: 'object',
      objectId: 42,
      x: 10,
      y: 20,
    })
  })

  it('injects object info from objectsById Map', () => {
    const raw = makeRawMap({
      elements: [{ id: 1, type: 1, objectId: 42, posX: 0, posY: 0 }],
    })
    const objectsById = new Map([[42, { name: 'router-01', class: 'Node', status: 3 }]])
    const result = adaptApiNetworkMap(raw, objectsById)
    const elem = result.elements[0]
    expect(elem.objectName).toBe('router-01')
    expect(elem.objectClass).toBe('Node')
    expect(elem.objectStatus).toBe(3)
  })

  it('injects the object geolocation the geographical canvas positions pins by', () => {
    const raw = makeRawMap({
      elements: [{ id: 1, type: 1, objectId: 42, posX: 0, posY: 0 }],
    })
    const objectsById = new Map([
      [42, { name: 'router-01', geoLocation: { type: 1, latitude: 51.51, longitude: -0.13 } }],
    ])
    const result = adaptApiNetworkMap(raw, objectsById)
    expect(result.elements[0].geolocation).toEqual({ lat: 51.51, lng: -0.13 })
  })

  it('leaves geolocation null for GeoLocation.UNSET (type 0) and unresolved objects', () => {
    const raw = makeRawMap({
      elements: [
        { id: 1, type: 1, objectId: 42, posX: 0, posY: 0 },
        { id: 2, type: 1, objectId: 43, posX: 0, posY: 0 },
      ],
    })
    const objectsById = new Map([
      [42, { name: 'unset', geoLocation: { type: 0, latitude: 0, longitude: 0 } }],
    ])
    const result = adaptApiNetworkMap(raw, objectsById)
    expect(result.elements[0].geolocation).toBeNull()
    expect(result.elements[1].geolocation).toBeNull()
  })

  it('parses geoBendPoints (lat/lon pairs) separately from pixel bendPoints', () => {
    const raw = makeRawMap({
      elements: [
        { id: 1, type: 1, objectId: 10, posX: 0, posY: 0 },
        { id: 2, type: 1, objectId: 11, posX: 100, posY: 0 },
      ],
      links: [
        {
          element1: 1,
          element2: 2,
          config: JSON.stringify({
            bendPoints: [50, 60],
            geoBendPoints: [
              [51.5, -0.1],
              [48.85, 2.35],
            ],
          }),
        },
      ],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.links[0].bendPoints).toEqual([{ x: 50, y: 60 }])
    expect(result.links[0].geoBendPoints).toEqual([
      { lat: 51.5, lng: -0.1 },
      { lat: 48.85, lng: 2.35 },
    ])
  })

  it('returns an empty geoBendPoints list when the link has none', () => {
    const raw = makeRawMap({
      elements: [
        { id: 1, type: 1, objectId: 10, posX: 0, posY: 0 },
        { id: 2, type: 1, objectId: 11, posX: 100, posY: 0 },
      ],
      links: [{ element1: 1, element2: 2, config: '{}' }],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.links[0].geoBendPoints).toEqual([])
  })

  it('converts decoration elements (type=2) and keeps generic ones (type=0) as passthrough', () => {
    const raw = makeRawMap({
      elements: [
        { id: 10, type: 0, posX: 5, posY: 5 },
        {
          id: 11,
          type: 2,
          posX: 20,
          posY: 20,
          decorationType: 0,
          color: 255,
          title: 'Box',
          width: 80,
          height: 40,
        },
      ],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.elements).toHaveLength(2)
    expect(result.elements[0].type).toBe('generic')
    expect(result.elements[1]).toMatchObject({
      type: 'decoration',
      decorationType: 'group-box',
      label: 'Box',
      width: 80,
      height: 40,
    })
    // NetXMS colors are BGR ints - 255 is red, not blue
    expect(result.elements[1].style.color).toBe('#ff0000')
  })

  it('keeps unknown element types as unrendered passthrough (lossless saves)', () => {
    const raw = makeRawMap({
      elements: [{ id: 99, type: 99, posX: 0, posY: 0 }],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].type).toBe('unknown')
    expect(result.elements[0].raw).toEqual(raw.elements[0])
  })

  it('converts links between object elements', () => {
    const raw = makeRawMap({
      elements: [
        { id: 1, type: 1, objectId: 10, posX: 0, posY: 0 },
        { id: 2, type: 1, objectId: 11, posX: 100, posY: 0 },
      ],
      links: [
        {
          element1: 1,
          element2: 2,
          type: 0,
          name: null,
          colorSource: 0,
          color: null,
          config: null,
        },
      ],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.links).toHaveLength(1)
    expect(result.links[0]).toMatchObject({ from: 'e-1', to: 'e-2' })
  })

  it('keeps dangling links (element not found) with null endpoints', () => {
    const raw = makeRawMap({
      elements: [{ id: 1, type: 1, objectId: 10, posX: 0, posY: 0 }],
      links: [{ element1: 1, element2: 999, type: 0, colorSource: 0 }],
    })
    const result = adaptApiNetworkMap(raw, new Map())
    expect(result.links).toHaveLength(1)
    expect(result.links[0].from).toBe('e-1')
    expect(result.links[0].to).toBeNull()
  })

  it('sets null background when backgroundColor is null', () => {
    const result = adaptApiNetworkMap(makeRawMap({ backgroundColor: null }), new Map())
    expect(result.background).toBeNull()
  })

  it('converts backgroundColor BGR int to hex (red in the low byte)', () => {
    const result = adaptApiNetworkMap(makeRawMap({ backgroundColor: 0x003366 }), new Map())
    expect(result.background).toEqual({ type: 'color', color: '#663300' })
  })

  it('sets null background for sentinel 0xFFFFFFFF', () => {
    const result = adaptApiNetworkMap(makeRawMap({ backgroundColor: 4294967295 }), new Map())
    expect(result.background).toBeNull()
  })
})

describe('collectDescendantMaps / collectDescendantGroups', () => {
  const tree = [
    {
      id: 1,
      class: 'NetworkMapGroup',
      name: 'Group A',
      children: [
        { id: 10, class: 'NetworkMap', name: 'Map A1' },
        {
          id: 2,
          class: 'NetworkMapGroup',
          name: 'Group A-Nested',
          children: [{ id: 20, class: 'NetworkMap', name: 'Map A2' }],
        },
      ],
    },
    { id: 11, class: 'NetworkMap', name: 'Map Top' },
  ]

  it('collects every map in the whole subtree, not just direct children', () => {
    const maps = collectDescendantMaps(tree)
    expect(maps.map((m) => m.id).sort()).toEqual([10, 11, 20])
  })

  it('collects every nested group', () => {
    const groups = collectDescendantGroups(tree)
    expect(groups.map((g) => g.id).sort()).toEqual([1, 2])
  })

  it('accepts a single group node (uses its .children)', () => {
    const groupNode = tree[0]
    expect(
      collectDescendantMaps(groupNode)
        .map((m) => m.id)
        .sort(),
    ).toEqual([10, 20])
    expect(collectDescendantGroups(groupNode).map((g) => g.id)).toEqual([2])
  })

  it('returns an empty array for a node with no children', () => {
    expect(collectDescendantMaps({ id: 99, class: 'NetworkMap' })).toEqual([])
    expect(collectDescendantGroups({ id: 99, class: 'NetworkMap' })).toEqual([])
  })
})

describe('grid snapping', () => {
  it('rounds to the nearest grid line', () => {
    expect(snapCoord(0, 80)).toBe(0)
    expect(snapCoord(39, 80)).toBe(0)
    expect(snapCoord(41, 80)).toBe(80)
    expect(snapCoord(120, 80)).toBe(160)
    expect(snapCoord(199, 80)).toBe(160)
  })

  it('handles negative coordinates symmetrically', () => {
    expect(snapCoord(-39, 80)).toBe(-0)
    expect(snapCoord(-41, 80)).toBe(-80)
    expect(snapCoord(-120, 80)).toBe(-80)
  })

  it('leaves non-finite values and a zero grid alone', () => {
    expect(snapCoord(Number.NaN, 80)).toBeNaN()
    expect(snapCoord(undefined, 80)).toBeUndefined()
    expect(snapCoord(37, 0)).toBe(37)
  })

  it('defaults to the shared grid size', () => {
    expect(GRID_SIZE).toBe(80)
    expect(snapCoord(41)).toBe(GRID_SIZE)
  })

  it('snaps a point to a grid vertex', () => {
    expect(snapPoint({ x: 41, y: 119 }, 80)).toEqual({ x: 80, y: 80 })
  })

  it('always yields multiples of the grid size', () => {
    for (const v of [0, 7, 13.4, 79.9, 250, -333]) {
      // Math.abs keeps the negative case off JS's -0, which toBe(0) rejects.
      expect(Math.abs(snapCoord(v, 80) % 80)).toBe(0)
    }
  })

  it('is idempotent', () => {
    const once = snapPoint({ x: 137, y: -22 }, 80)
    expect(snapPoint(once, 80)).toEqual(once)
  })
})

describe('resolveMapRenderOptions', () => {
  it('reads the boolean-object wire form from rawContent', () => {
    const opts = resolveMapRenderOptions({
      rawContent: {
        flags: { showStatusFrame: true, showLinkDirection: true, showStatusIcon: false },
      },
    })
    expect(opts.showStatusFrame).toBe(true)
    expect(opts.showLinkDirection).toBe(true)
    expect(opts.showStatusIcon).toBe(false)
    expect(opts.showStatusBackground).toBe(false)
  })

  it('reads the raw integer wire form older servers send', () => {
    const opts = resolveMapRenderOptions({
      rawContent: { flags: MAP_FLAGS.SHOW_STATUS_BKGND | MAP_FLAGS.TRANSLUCENT_LABEL_BKGND },
    })
    expect(opts.showStatusBackground).toBe(true)
    expect(opts.translucentLabelBackground).toBe(true)
    expect(opts.showStatusFrame).toBe(false)
  })

  it('prefers rawContent over the derived top-level bitmask', () => {
    // The editor writes rawContent.flags; a stale top-level value must not win.
    const opts = resolveMapRenderOptions({
      flags: MAP_FLAGS.SHOW_STATUS_ICON,
      rawContent: { flags: { showStatusIcon: false, showStatusFrame: true } },
    })
    expect(opts.showStatusIcon).toBe(false)
    expect(opts.showStatusFrame).toBe(true)
  })

  it('falls back to the top-level bitmask when rawContent has no flags', () => {
    const opts = resolveMapRenderOptions({ flags: MAP_FLAGS.SHOW_LINK_DIRECTION, rawContent: {} })
    expect(opts.showLinkDirection).toBe(true)
  })

  it('defaults maps that carry no flags at all (demo maps)', () => {
    const opts = resolveMapRenderOptions({ elements: [], links: [] })
    expect(opts.flags).toBe(DEFAULT_MAP_FLAGS)
    expect(opts.showStatusIcon).toBe(true)
    expect(opts.showStatusFrame).toBe(true)
    expect(opts.showStatusBackground).toBe(true)
    expect(opts.translucentLabelBackground).toBe(true)
  })

  it('treats an explicit 0 as "everything off", not as missing', () => {
    const opts = resolveMapRenderOptions({ flags: 0, rawContent: {} })
    expect(opts.flags).toBe(0)
    expect(opts.showStatusIcon).toBe(false)
    expect(opts.showStatusFrame).toBe(false)
    expect(opts.showStatusBackground).toBe(false)
  })

  it('survives a null map', () => {
    expect(resolveMapRenderOptions(null).flags).toBe(DEFAULT_MAP_FLAGS)
    expect(resolveMapRenderOptions(undefined).displayMode).toBe(0)
  })

  it('reads the object display mode, defaulting to icons', () => {
    expect(resolveMapRenderOptions({ rawContent: { objectDisplayMode: 3 } }).displayMode).toBe(3)
    expect(resolveMapRenderOptions({ rawContent: {} }).displayMode).toBe(0)
  })
})

describe('resolveMapBackdrop', () => {
  it('returns none for missing rawContent or the null-UUID sentinel', () => {
    expect(resolveMapBackdrop(null)).toEqual({ type: 'none' })
    expect(resolveMapBackdrop({})).toEqual({ type: 'none' })
    expect(resolveMapBackdrop({ rawContent: { background: MAP_BACKGROUND_NONE } })).toEqual({
      type: 'none',
    })
  })

  it('resolves a geographic backdrop from the geomap sentinel', () => {
    const b = resolveMapBackdrop({
      rawContent: {
        background: MAP_BACKGROUND_GEOMAP,
        backgroundLatitude: 51.5,
        backgroundLongitude: -0.12,
        backgroundZoom: 10,
        width: 800,
        height: 600,
      },
    })
    expect(b).toEqual({
      type: 'geo',
      lat: 51.5,
      lon: -0.12,
      zoom: 10,
      page: { w: 800, h: 600 },
    })
  })

  it('falls back to a default page and zoom for a geo backdrop with no size', () => {
    const b = resolveMapBackdrop({ rawContent: { background: MAP_BACKGROUND_GEOMAP } })
    expect(b.type).toBe('geo')
    expect(b.zoom).toBe(1)
    expect(b.page).toEqual(DEFAULT_GEO_BACKDROP_PAGE)
  })

  it('clamps an out-of-range geo zoom into 0..19', () => {
    const raw = (z) => ({ rawContent: { background: MAP_BACKGROUND_GEOMAP, backgroundZoom: z } })
    expect(resolveMapBackdrop(raw(99)).zoom).toBe(19)
    expect(resolveMapBackdrop(raw(-5)).zoom).toBe(0)
    expect(resolveMapBackdrop(raw(7.9)).zoom).toBe(7)
  })

  it('resolves a static image backdrop, defaulting to native placement', () => {
    const guid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const b = resolveMapBackdrop({
      rawContent: { background: guid, width: 640, height: 480 },
    })
    expect(b).toEqual({ type: 'image', guid, mode: 'default', page: { w: 640, h: 480 } })
  })

  it('maps the center and fit flags to placement modes (fit wins)', () => {
    const guid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const center = resolveMapBackdrop({
      rawContent: { background: guid, flags: MAP_FLAGS.CENTER_BKGND_IMAGE },
    })
    expect(center.mode).toBe('center')

    const fit = resolveMapBackdrop({
      rawContent: { background: guid, flags: MAP_FLAGS.FIT_BKGND_IMAGE },
    })
    expect(fit.mode).toBe('fit')

    const both = resolveMapBackdrop({
      rawContent: {
        background: guid,
        flags: MAP_FLAGS.CENTER_BKGND_IMAGE | MAP_FLAGS.FIT_BKGND_IMAGE,
      },
    })
    expect(both.mode).toBe('fit')
  })

  it('reads flags from the top-level bitmask when rawContent has none', () => {
    const guid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const b = resolveMapBackdrop({
      rawContent: { background: guid },
      flags: MAP_FLAGS.CENTER_BKGND_IMAGE,
    })
    expect(b.mode).toBe('center')
  })
})

describe('resizeBackdropPage', () => {
  const page = { w: 800, h: 400 }

  it('moves only the side its handle holds', () => {
    expect(resizeBackdropPage(page, 'e', 100, 50)).toEqual({ width: 900, height: 400 })
    expect(resizeBackdropPage(page, 's', 100, 50)).toEqual({ width: 800, height: 450 })
    expect(resizeBackdropPage(page, 'se', 100, 50)).toEqual({ width: 900, height: 450 })
  })

  it("keeps the corner on the image's proportions, following the side pulled further", () => {
    // 2:1 image: 100 across pulls further than 10 down.
    expect(resizeBackdropPage(page, 'se', 100, 10, { aspect: 2 })).toEqual({
      width: 900,
      height: 450,
    })
    expect(resizeBackdropPage(page, 'se', 10, 100, { aspect: 2 })).toEqual({
      width: 1000,
      height: 500,
    })
    // The edges stay free.
    expect(resizeBackdropPage(page, 'e', 100, 0, { aspect: 2 })).toEqual({
      width: 900,
      height: 400,
    })
  })

  it('never folds the page past 16 units', () => {
    expect(resizeBackdropPage(page, 'se', -2000, -2000)).toEqual({ width: 16, height: 16 })
  })
})

describe('backgroundFitModeFromFlags / flagsWithBackgroundFitMode', () => {
  const { NATIVE, CENTER, FIT } = MAP_BACKGROUND_FIT_MODES

  it('reads native when neither placement bit is set', () => {
    expect(backgroundFitModeFromFlags(0)).toBe(NATIVE)
    expect(backgroundFitModeFromFlags(MAP_FLAGS.SHOW_STATUS_ICON)).toBe(NATIVE)
    expect(backgroundFitModeFromFlags(null)).toBe(NATIVE)
  })

  it('reads center and fit from their bits, fit winning when both are set', () => {
    expect(backgroundFitModeFromFlags(MAP_FLAGS.CENTER_BKGND_IMAGE)).toBe(CENTER)
    expect(backgroundFitModeFromFlags(MAP_FLAGS.FIT_BKGND_IMAGE)).toBe(FIT)
    expect(
      backgroundFitModeFromFlags(MAP_FLAGS.CENTER_BKGND_IMAGE | MAP_FLAGS.FIT_BKGND_IMAGE),
    ).toBe(FIT)
  })

  it('sets the requested mode and clears the other placement bit', () => {
    expect(flagsWithBackgroundFitMode(0, FIT) & MAP_FLAGS.FIT_BKGND_IMAGE).toBeTruthy()
    expect(flagsWithBackgroundFitMode(0, FIT) & MAP_FLAGS.CENTER_BKGND_IMAGE).toBe(0)
    expect(flagsWithBackgroundFitMode(0, CENTER) & MAP_FLAGS.CENTER_BKGND_IMAGE).toBeTruthy()
    expect(flagsWithBackgroundFitMode(0, CENTER) & MAP_FLAGS.FIT_BKGND_IMAGE).toBe(0)
  })

  it('native clears both placement bits', () => {
    const both = MAP_FLAGS.CENTER_BKGND_IMAGE | MAP_FLAGS.FIT_BKGND_IMAGE
    const next = flagsWithBackgroundFitMode(both, NATIVE)
    expect(next & MAP_FLAGS.CENTER_BKGND_IMAGE).toBe(0)
    expect(next & MAP_FLAGS.FIT_BKGND_IMAGE).toBe(0)
  })

  it('preserves unrelated flag bits', () => {
    const base = MAP_FLAGS.SHOW_STATUS_ICON | MAP_FLAGS.SHOW_LINK_DIRECTION
    const next = flagsWithBackgroundFitMode(base, FIT)
    expect(next & MAP_FLAGS.SHOW_STATUS_ICON).toBeTruthy()
    expect(next & MAP_FLAGS.SHOW_LINK_DIRECTION).toBeTruthy()
  })

  it('round-trips every mode', () => {
    for (const mode of [NATIVE, CENTER, FIT]) {
      expect(backgroundFitModeFromFlags(flagsWithBackgroundFitMode(0, mode))).toBe(mode)
    }
  })
})

describe('linkDefaultsChanged', () => {
  it('treats the two defaultLinkWidth spellings as the same field', () => {
    const a = { rawContent: { defaultLinkWidht: 3 } }
    const b = { rawContent: { defaultLinkWidth: 3 } }
    expect(linkDefaultsChanged(a, b)).toBe(false)
  })

  it('treats a nullish field and an explicit 0 as equal', () => {
    const a = { rawContent: {} }
    const b = { rawContent: { defaultLinkStyle: 0, defaultLinkColorSource: 0 } }
    expect(linkDefaultsChanged(a, b)).toBe(false)
  })

  it('reports a real edit to any baked-in default', () => {
    const base = { rawContent: { defaultLinkStyle: 2, defaultLinkWidth: 3 } }
    expect(
      linkDefaultsChanged(base, { rawContent: { ...base.rawContent, defaultLinkStyle: 3 } }),
    ).toBe(true)
    expect(
      linkDefaultsChanged(base, { rawContent: { ...base.rawContent, defaultLinkWidth: 4 } }),
    ).toBe(true)
    expect(
      linkDefaultsChanged(base, { rawContent: { ...base.rawContent, defaultLinkColor: 255 } }),
    ).toBe(true)
  })
})

describe('isGeographicalCanvas', () => {
  it('is true for canvasType GEOGRAPHICAL in rawContent', () => {
    expect(isGeographicalCanvas({ rawContent: { canvasType: 1 } })).toBe(true)
  })

  it('is false for the graph canvas and for a map with no canvasType', () => {
    expect(isGeographicalCanvas({ rawContent: { canvasType: 0 } })).toBe(false)
    expect(isGeographicalCanvas({ rawContent: {} })).toBe(false)
    expect(isGeographicalCanvas(null)).toBe(false)
  })

  it('prefers rawContent over the top-level field, so a live preview patch wins', () => {
    expect(isGeographicalCanvas({ canvasType: 0, rawContent: { canvasType: 1 } })).toBe(true)
    expect(isGeographicalCanvas({ canvasType: 1, rawContent: { canvasType: 0 } })).toBe(false)
  })

  it('is true for the demo geo map, which carries no rawContent', () => {
    expect(isGeographicalCanvas({ mapType: MAP_TYPE_GEO })).toBe(true)
  })
})

describe('mapInitialView', () => {
  it('reads mode, centre and zoom from rawContent', () => {
    const view = mapInitialView({
      rawContent: {
        initialViewMode: 1,
        backgroundLatitude: 46.03,
        backgroundLongitude: 7.17,
        backgroundZoom: 8,
      },
    })
    expect(view).toEqual({ mode: 1, lat: 46.03, lon: 7.17, zoom: 8 })
  })

  it('falls back to zoom 3 when the map has none (legacy createGeoContent)', () => {
    expect(mapInitialView({ rawContent: { backgroundZoom: 0 } }).zoom).toBe(3)
    expect(mapInitialView({ rawContent: {} }).zoom).toBe(3)
  })

  it('defaults to FIT_TO_SCREEN at 0,0 for a map with no stored view', () => {
    expect(mapInitialView(null)).toEqual({ mode: 0, lat: 0, lon: 0, zoom: 3 })
  })
})

describe('countUnplacedObjects', () => {
  it('counts object elements with no geolocation', () => {
    const map = {
      elements: [
        { type: 'object', geolocation: { lat: 1, lng: 2 } },
        { type: 'object', geolocation: null },
        { type: 'object' },
      ],
    }
    expect(countUnplacedObjects(map)).toBe(2)
  })

  it('ignores decorations and other non-object elements', () => {
    const map = {
      elements: [
        { type: 'decoration' },
        { type: 'text-box' },
        { type: 'dci-container' },
        { type: 'object', geolocation: { lat: 1, lng: 2 } },
      ],
    }
    expect(countUnplacedObjects(map)).toBe(0)
  })

  it('returns 0 for an empty or missing map', () => {
    expect(countUnplacedObjects({ elements: [] })).toBe(0)
    expect(countUnplacedObjects(null)).toBe(0)
  })
})

describe('linkDirectionOptions', () => {
  it('labels the directions with the element names, element 1 first for FORWARD', () => {
    expect(linkDirectionOptions('core-sw', 'edge-rtr')).toEqual([
      { label: 'No direction', value: 'NONE' },
      { label: 'core-sw \u2192 edge-rtr', value: 'FORWARD' },
      { label: 'edge-rtr \u2192 core-sw', value: 'REVERSE' },
    ])
  })

  it('falls back to generic names for unnamed elements', () => {
    expect(linkDirectionOptions('', undefined).map((o) => o.label)).toEqual([
      'No direction',
      'Element 1 \u2192 Element 2',
      'Element 2 \u2192 Element 1',
    ])
  })
})

describe('linkStatus', () => {
  const sources = (objects, interfaces) => ({
    statusSources: {
      objects: objects.map((status) => ({ status })),
      interfaces: interfaces.map((status) => ({ status })),
    },
  })

  it('takes the most critical object-status-list status', () => {
    expect(linkStatus(sources([1, 3, 2], [4]))).toBe(3)
  })

  it('falls back to the endpoint interfaces when no status object is known', () => {
    expect(linkStatus(sources([5], [2, 1]))).toBe(2)
  })

  it('is null when nothing resolvable is known', () => {
    expect(linkStatus(sources([], [6]))).toBeNull()
    expect(linkStatus({})).toBeNull()
  })
})

describe('linkLabelFraction', () => {
  it('places each location inside its own 3-of-11 part of the line', () => {
    expect(linkLabelFraction('CENTER')).toBeCloseTo(0.5)
    expect(linkLabelFraction('OBJECT1', 0)).toBeCloseTo(1 / 11)
    expect(linkLabelFraction('OBJECT2', 100)).toBeCloseTo(10 / 11)
    expect(linkLabelFraction('CENTER', 250)).toBeCloseTo(7 / 11)
  })
})
