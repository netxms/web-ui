import { describe, it, expect } from 'vitest'
import {
  hexToBgrInt,
  nextElementId,
  createObjectElement,
  createGroupBoxElement,
  createTextBoxElement,
  createDciContainerElement,
  createDciImageElement,
  createMapLink,
  adaptApiNetworkMap,
  networkMapObjectIds,
  mergeObjectEdit,
  mergeDecorationEdit,
  mergeTextBoxEdit,
  mergeDciContainerEdit,
  mergeDciImageEdit,
  mergeLinkEdit,
  editLinkDataSource,
  serializeNetworkMapContent,
  LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE,
  MAP_LINK_COLOR_SOURCES,
} from '@/utils/networkMapAdapters'

describe('hexToBgrInt', () => {
  it('encodes red in the low byte (inverse of bgrIntToHex)', () => {
    expect(hexToBgrInt('#ff0000')).toBe(255) // pure red -> low byte
    expect(hexToBgrInt('#ffffff')).toBe(16777215)
    expect(hexToBgrInt('#000000')).toBe(0)
    expect(hexToBgrInt('#40699c')).toBe(10250560) // group-box default RGB(64,105,156)
  })
})

describe('nextElementId', () => {
  it('returns max numeric id + 1', () => {
    const map = {
      elements: [
        { id: 'e-2', raw: { id: 2 } },
        { id: 'e-7', raw: { id: 7 } },
      ],
    }
    expect(nextElementId(map)).toBe(8)
  })
  it('returns 1 for an empty map', () => {
    expect(nextElementId({ elements: [] })).toBe(1)
  })
})

describe('createObjectElement', () => {
  it('builds an object element with legacy defaults and display fields', () => {
    const el = createObjectElement({
      id: 5,
      objectId: 101,
      objectName: 'core-sw',
      objectClass: 'Node',
      objectStatus: 1,
      x: 120.6,
      y: 80.2,
    })
    expect(el.id).toBe('e-5')
    expect(el.type).toBe('object')
    expect(el.apiType).toBe(1)
    expect(el.objectName).toBe('core-sw')
    expect(el.objectStatus).toBe(1)
    expect(el.raw).toEqual({
      id: 5,
      type: 1,
      posX: 121,
      posY: 80,
      flags: 0,
      objectId: 101,
      width: 100,
      height: 100,
    })
  })
})

describe('createGroupBoxElement', () => {
  it('builds a group box with the legacy default color/size', () => {
    const el = createGroupBoxElement({ id: 3, x: 10, y: 20 })
    expect(el.type).toBe('decoration')
    expect(el.decorationType).toBe('group-box')
    expect(el.label).toBe('')
    expect(el.width).toBe(250)
    expect(el.height).toBe(100)
    expect(el.style.color).toBe('#40699c')
    expect(el.raw.color).toBe(10250560)
    expect(el.raw.decorationType).toBe(0)
  })
})

describe('createTextBoxElement', () => {
  it('builds a text box with the legacy constructor defaults', () => {
    const el = createTextBoxElement({ id: 9, x: 0, y: 0 })
    expect(el.type).toBe('text-box')
    expect(el.apiType).toBe(5)
    expect(el.text).toBe('')
    expect(el.backgroundColor).toBe('#ffffff')
    expect(el.textColor).toBe('#000000')
    expect(el.fontSize).toBe(10)
    expect(el.borderRequired).toBe(true)
    expect(JSON.parse(el.raw.config)).toEqual({
      text: '',
      backgroundColor: 2147483647,
      textColor: 0,
      borderColor: 0,
      fontSize: 10,
      drillDownObjectId: 0,
      borderRequired: true,
    })
  })

  it('serializes with both config and TextBox keys', () => {
    const el = createTextBoxElement({ id: 9, x: 5, y: 6 })
    const content = serializeNetworkMapContent({ elements: [el], links: [], rawContent: {} })
    const out = content.elements[0]
    expect(out.type).toBe(5)
    expect(out.posX).toBe(5)
    expect(out.TextBox).toBe(out.config)
  })
})

describe('createDciContainerElement', () => {
  it('builds a DCI container with the legacy DciContainerConfiguration defaults', () => {
    const el = createDciContainerElement({ id: 4, x: 12, y: 34 })
    expect(el.type).toBe('dci-container')
    expect(el.apiType).toBe(3)
    expect(el.dciList).toEqual([])
    expect(el.backgroundColor).toBe('#ffffff')
    expect(el.textColor).toBe('#202020')
    expect(el.borderColor).toBe('#202020')
    expect(el.borderRequired).toBe(false)
    expect(JSON.parse(el.raw.dciList)).toEqual({
      dciList: [],
      backgroundColor: 0xffffff,
      textColor: 0x202020,
      borderColor: 0x202020,
      borderRequired: false,
    })
  })

  it('serializes with both dciList and DCIList keys', () => {
    const el = createDciContainerElement({ id: 4, x: 5, y: 6 })
    const content = serializeNetworkMapContent({ elements: [el], links: [], rawContent: {} })
    const out = content.elements[0]
    expect(out.type).toBe(3)
    expect(out.posX).toBe(5)
    expect(out.DCIList).toBe(out.dciList)
  })
})

describe('createDciImageElement', () => {
  it('builds a DCI image with the legacy DCIImageConfiguration defaults', () => {
    const el = createDciImageElement({ id: 5, x: 0, y: 0 })
    expect(el.type).toBe('dci-image')
    expect(el.apiType).toBe(4)
    expect(el.dciRuleList).toEqual([])
    expect(el.dci).toBeNull()
    expect(el.defaultImage).toBeNull()
    expect(JSON.parse(el.raw.dciList)).toEqual({ dciRuleList: [], dci: null, defaultImage: null })
  })

  it('serializes with both dciList and DCIList keys', () => {
    const el = createDciImageElement({ id: 5, x: 7, y: 8 })
    const content = serializeNetworkMapContent({ elements: [el], links: [], rawContent: {} })
    const out = content.elements[0]
    expect(out.type).toBe(4)
    expect(out.DCIList).toBe(out.dciList)
  })
})

describe('mergeDciContainerEdit', () => {
  it('regenerates raw.dciList (hex -> BGR) from modeled fields', () => {
    const el = createDciContainerElement({ id: 4, x: 0, y: 0 })
    const dci = { nodeId: 101, dciId: 2001, type: 0, instance: '', column: '', formatString: '%s' }
    const next = mergeDciContainerEdit(el, {
      dciList: [dci],
      backgroundColor: '#ff0000',
      borderRequired: true,
      x: 50,
    })
    expect(next.dciList).toEqual([dci])
    expect(next.backgroundColor).toBe('#ff0000')
    expect(next.borderRequired).toBe(true)
    expect(next.x).toBe(50)
    expect(next.raw.posX).toBe(50)
    const cfg = JSON.parse(next.raw.dciList)
    expect(cfg.dciList).toEqual([dci])
    expect(cfg.backgroundColor).toBe(255) // #ff0000 -> BGR (red low byte)
    expect(cfg.borderRequired).toBe(true)
    expect(el.dciList).toEqual([])
    expect(JSON.parse(el.raw.dciList).borderRequired).toBe(false)
  })
})

describe('mergeDciImageEdit', () => {
  it('regenerates raw.dciList from modeled fields', () => {
    const el = createDciImageElement({ id: 5, x: 0, y: 0 })
    const dci = {
      nodeId: 101,
      dciId: 2003,
      type: 0,
      instance: '',
      column: '',
      formatString: '',
      name: 'CPU',
    }
    const rule = { comparisonType: 4, image: 'img-guid', compareValue: '80', comment: 'high' }
    const next = mergeDciImageEdit(el, {
      dci,
      defaultImage: 'default-guid',
      dciRuleList: [rule],
    })
    expect(next.dci).toEqual(dci)
    expect(next.defaultImage).toBe('default-guid')
    expect(next.dciRuleList).toEqual([rule])
    const cfg = JSON.parse(next.raw.dciList)
    expect(cfg.dci).toEqual(dci)
    expect(cfg.defaultImage).toBe('default-guid')
    expect(cfg.dciRuleList).toEqual([rule])
    expect(el.defaultImage).toBeNull()
    expect(JSON.parse(el.raw.dciList).dciRuleList).toEqual([])
  })
})

describe('mergeDecorationEdit', () => {
  it('updates modeled + raw fields without mutating the original', () => {
    const el = createGroupBoxElement({ id: 3, x: 0, y: 0 })
    const next = mergeDecorationEdit(el, { label: 'Core', color: '#112233', width: 300, x: 40 })
    expect(next.label).toBe('Core')
    expect(next.raw.title).toBe('Core')
    expect(next.style.color).toBe('#112233')
    expect(next.raw.color).toBe(hexToBgrInt('#112233'))
    expect(next.width).toBe(300)
    expect(next.raw.width).toBe(300)
    expect(next.x).toBe(40)
    expect(next.raw.posX).toBe(40)
    expect(el.label).toBe('')
    expect(el.raw.title).toBe('')
  })

  it('maps imageGuid onto raw.title for image decorations', () => {
    const el = {
      id: 'e-5',
      type: 'decoration',
      decorationType: 'image',
      style: {},
      raw: { id: 5, type: 2, decorationType: 1, title: 'old' },
    }
    const next = mergeDecorationEdit(el, { imageGuid: 'new-guid' })
    expect(next.imageGuid).toBe('new-guid')
    expect(next.raw.title).toBe('new-guid')
  })
})

describe('createMapLink', () => {
  const fromElement = createObjectElement({ id: 2, objectId: 101, x: 0, y: 0 })
  const toElement = createObjectElement({ id: 3, objectId: 102, x: 100, y: 0 })

  it('builds a NORMAL link with legacy defaults and an empty config', () => {
    const link = createMapLink({ id: 'l-9', fromElement, toElement })
    expect(link.id).toBe('l-9')
    expect(link.from).toBe('e-2')
    expect(link.to).toBe('e-3')
    expect(link.type).toBe(0)
    expect(link.label).toBeNull()
    expect(link.colorSource).toBe(MAP_LINK_COLOR_SOURCES.DEFAULT)
    // LinkConfig defaults surface on the modeled fields even with config unset
    expect(link.routing).toBe(0)
    expect(link.style).toBe(0)
    expect(link.width).toBe(0)
    expect(link.labelPosition).toBe(50)
    expect(link.objectStatusList).toEqual([])
    expect(link.dciList).toEqual([])
    expect(link.raw).toEqual({
      element1: 2,
      element2: 3,
      interface1: 0,
      interface2: 0,
      type: 0,
      name: '',
      connectorName1: '',
      connectorName2: '',
      flags: 0,
      colorSource: 0,
      color: 0,
      colorProvider: '',
      config: '',
    })
  })

  it('serializes as raw passthrough', () => {
    const link = createMapLink({ id: 'l-0', fromElement, toElement })
    const content = serializeNetworkMapContent({
      elements: [fromElement, toElement],
      links: [link],
      rawContent: {},
    })
    expect(content.links).toEqual([link.raw])
  })
})

describe('mergeLinkEdit', () => {
  const fromElement = createObjectElement({ id: 2, objectId: 101, x: 0, y: 0 })
  const toElement = createObjectElement({ id: 3, objectId: 102, x: 100, y: 0 })
  const baseLink = () => createMapLink({ id: 'l-0', fromElement, toElement })

  it('merges top-level fields into raw without touching config', () => {
    const next = mergeLinkEdit(baseLink(), {
      label: 'uplink',
      connectorName1: 'eth0',
      connectorName2: 'ge-0/0/1',
      interface1: 201,
      interface2: 301,
    })
    expect(next.label).toBe('uplink')
    expect(next.raw.name).toBe('uplink')
    expect(next.raw.connectorName1).toBe('eth0')
    expect(next.raw.connectorName2).toBe('ge-0/0/1')
    expect(next.raw.interface1).toBe(201)
    expect(next.raw.interface2).toBe(301)
    expect(next.raw.config).toBe('') // untouched — stays byte-identical
  })

  it('sets custom color as a BGR int and recomputes the derived display fields', () => {
    const next = mergeLinkEdit(baseLink(), {
      colorSource: MAP_LINK_COLOR_SOURCES.CUSTOM,
      customColor: '#ff0000',
    })
    expect(next.raw.colorSource).toBe(2)
    expect(next.raw.color).toBe(255) // red in the low byte
    expect(next.color).toBe('custom')
    expect(next.customColor).toBe('#ff0000')
  })

  it('toggles the exclude-from-auto-update flag bit', () => {
    const on = mergeLinkEdit(baseLink(), { excludeFromAutoUpdate: true })
    expect(on.raw.flags & LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE).toBeTruthy()
    expect(on.excludeFromAutoUpdate).toBe(true)
    const off = mergeLinkEdit(on, { excludeFromAutoUpdate: false })
    expect(off.raw.flags & LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE).toBe(0)
  })

  it('regenerates config for LinkConfig keys while preserving unmodeled keys', () => {
    const link = baseLink()
    link.raw.config = JSON.stringify({
      routing: 3,
      bendPoints: [350, 180, 420, 260],
      labelPosition: 50,
      style: 1,
      width: 3,
    })
    const next = mergeLinkEdit(link, { style: 2, width: 5, labelPosition: 25 })
    const cfg = JSON.parse(next.raw.config)
    expect(cfg.style).toBe(2)
    expect(cfg.width).toBe(5)
    expect(cfg.labelPosition).toBe(25)
    expect(cfg.routing).toBe(3) // untouched
    expect(cfg.bendPoints).toEqual([350, 180, 420, 260]) // unmodeled — preserved
    expect(next.style).toBe(2)
    expect(JSON.parse(link.raw.config).style).toBe(1)
  })

  it('writes object status list and DCI list into config', () => {
    const dci = {
      nodeId: 101,
      dciId: 2001,
      type: 1,
      instance: '',
      column: '',
      formatString: '%s bps',
      system: false,
      location: 'CENTER',
    }
    const next = mergeLinkEdit(baseLink(), {
      colorSource: MAP_LINK_COLOR_SOURCES.OBJECT_STATUS,
      objectStatusList: [101, 102],
      useActiveThresholds: true,
      dciList: [dci],
    })
    const cfg = JSON.parse(next.raw.config)
    expect(cfg.objectStatusList).toEqual([101, 102])
    expect(cfg.useActiveThresholds).toBe(true)
    expect(cfg.dciList).toEqual([dci])
    expect(next.color).toBe('status')
  })

  it('serializes bend points ({x,y}[]) to the legacy flat array and rounds them', () => {
    const link = baseLink()
    link.raw.config = JSON.stringify({ routing: 3, style: 1, dciList: [{ dciId: 7 }] })
    const next = mergeLinkEdit(link, {
      bendPoints: [
        { x: 10.6, y: 20.2 },
        { x: 30, y: 40 },
      ],
    })
    expect(next.bendPoints).toEqual([
      { x: 11, y: 20 },
      { x: 30, y: 40 },
    ])
    const cfg = JSON.parse(next.raw.config)
    expect(cfg.bendPoints).toEqual([11, 20, 30, 40])
    // Unmodeled config keys survive; routing is NOT auto-changed by the adapter.
    expect(cfg.routing).toBe(3)
    expect(cfg.style).toBe(1)
    expect(cfg.dciList).toEqual([{ dciId: 7 }])
  })

  it('clears bend points to an empty flat array', () => {
    const link = baseLink()
    link.raw.config = JSON.stringify({ bendPoints: [1, 2, 3, 4], routing: 3 })
    const next = mergeLinkEdit(link, { bendPoints: [] })
    expect(next.bendPoints).toEqual([])
    expect(JSON.parse(next.raw.config).bendPoints).toEqual([])
  })
})

describe('mergeTextBoxEdit', () => {
  it('regenerates raw.config (hex -> BGR) from modeled fields', () => {
    const el = createTextBoxElement({ id: 9, x: 0, y: 0 })
    const next = mergeTextBoxEdit(el, { text: 'Hello', textColor: '#ff0000', fontSize: 14 })
    expect(next.text).toBe('Hello')
    expect(next.fontSize).toBe(14)
    const cfg = JSON.parse(next.raw.config)
    expect(cfg.text).toBe('Hello')
    expect(cfg.textColor).toBe(255) // #ff0000 -> BGR
    expect(cfg.fontSize).toBe(14)
    expect(cfg.borderRequired).toBe(true)
    expect(el.text).toBe('')
  })
})

describe('object elements', () => {
  it('carries a default size for floor-plan display mode', () => {
    const el = createObjectElement({ id: 3, objectId: 42, x: 10, y: 20 })
    expect(el).toMatchObject({ width: 100, height: 100 })
  })

  it('adopts the persisted size when the server sends one', () => {
    const map = adaptApiNetworkMap(
      {
        id: 1,
        elements: [{ id: 1, type: 1, objectId: 7, posX: 0, posY: 0, width: 240, height: 90 }],
      },
      new Map(),
    )
    expect(map.elements[0]).toMatchObject({ width: 240, height: 90 })
  })

  it('injects the primary IP and MAC for large-label mode', () => {
    const objects = new Map([
      [7, { id: 7, name: 'core', class: 'Node', status: 0, ipAddress: { address: '10.0.0.1' } }],
      [8, { id: 8, name: 'eth0', class: 'Interface', status: 0, macAddress: 'aa:bb:cc:dd:ee:ff' }],
    ])
    const map = adaptApiNetworkMap(
      {
        id: 1,
        elements: [
          { id: 1, type: 1, objectId: 7, posX: 0, posY: 0 },
          { id: 2, type: 1, objectId: 8, posX: 0, posY: 0 },
        ],
      },
      objects,
    )
    expect(map.elements[0]).toMatchObject({ objectIpAddress: '10.0.0.1', objectMacAddress: null })
    expect(map.elements[1]).toMatchObject({
      objectIpAddress: null,
      objectMacAddress: 'aa:bb:cc:dd:ee:ff',
    })
  })

  it('leaves address fields null when the object could not be resolved', () => {
    const map = adaptApiNetworkMap(
      { id: 1, elements: [{ id: 1, type: 1, objectId: 99, posX: 0, posY: 0 }] },
      new Map(),
    )
    expect(map.elements[0]).toMatchObject({ objectIpAddress: null, objectMacAddress: null })
  })
})

describe('mergeObjectEdit', () => {
  it('applies geometry to both modeled and raw fields', () => {
    const el = createObjectElement({ id: 1, objectId: 5, x: 0, y: 0 })
    const next = mergeObjectEdit(el, { x: 30, y: 40, width: 200, height: 120 })
    expect(next).toMatchObject({ x: 30, y: 40, width: 200, height: 120 })
    expect(next.raw).toMatchObject({ posX: 30, posY: 40, width: 200, height: 120 })
    expect(el.x).toBe(0)
    expect(el.width).toBe(100)
  })

  it('ignores keys it does not model', () => {
    const el = createObjectElement({ id: 1, objectId: 5, x: 0, y: 0 })
    const next = mergeObjectEdit(el, { objectName: 'renamed', objectStatus: 4 })
    expect(next.objectName).toBe('')
    expect(next.objectStatus).toBe(5)
  })
})

// The IDs a map refers to are needed before the objects exist: useNetworkMap resolves them as
// separate queries.
describe('networkMapObjectIds', () => {
  it('collects element objects and link status sources, deduplicated', () => {
    const ids = networkMapObjectIds({
      elements: [
        { id: 1, type: 1, objectId: 101 },
        { id: 2, type: 1, objectId: 102 },
        { id: 3, type: 1, objectId: 101 }, // same object twice on the map
        { id: 4, type: 5, objectId: 999 }, // a text box is not an object element
      ],
      links: [
        { interface1: 201, interface2: 202, config: '' },
        { interface1: 201, interface2: 0, config: JSON.stringify({ objectStatusList: [301] }) },
      ],
    })

    expect(ids).toEqual([101, 102, 201, 202, 301])
  })

  it('returns nothing for a map with no elements or links', () => {
    expect(networkMapObjectIds({})).toEqual([])
    expect(networkMapObjectIds(null)).toEqual([])
  })
})

describe('editLinkDataSource', () => {
  const systemSource = {
    nodeId: 5,
    dciId: 11,
    formatString: '%{u,m}s',
    location: 'CENTER',
    direction: 'FORWARD',
    system: true,
  }

  it("makes a server-managed source the user's once a compared field changes", () => {
    const next = editLinkDataSource(systemSource, { direction: 'REVERSE' })
    expect(next).toMatchObject({ direction: 'REVERSE', system: false })
    expect(editLinkDataSource(systemSource, { formatString: '%s' }).system).toBe(false)
  })

  it('keeps it server-managed when the edit changes nothing', () => {
    expect(editLinkDataSource(systemSource, { direction: 'FORWARD' }).system).toBe(true)
    // An absent direction is NONE, so picking NONE is no change either.
    const undirected = { ...systemSource, direction: undefined }
    expect(editLinkDataSource(undirected, { direction: 'NONE' }).system).toBe(true)
  })

  it('applies the patch to a user source and never returns the same object', () => {
    const user = { ...systemSource, system: false }
    const next = editLinkDataSource(user, { location: 'OBJECT1' })
    expect(next).toMatchObject({ location: 'OBJECT1', system: false })
    expect(next).not.toBe(user)
  })
})

describe('linkMergeThreshold', () => {
  const apiMap = (extra) => ({ id: 1, name: 'm', elements: [], links: [], ...extra })

  it('round-trips the parallel-link merge threshold as a map setting', () => {
    const map = adaptApiNetworkMap(apiMap({ linkMergeThreshold: 4 }), new Map())
    expect(map.rawContent.linkMergeThreshold).toBe(4)
    expect(serializeNetworkMapContent(map).linkMergeThreshold).toBe(4)
  })

  it('leaves it out of the payload when the server did not send it', () => {
    const map = adaptApiNetworkMap(apiMap(), new Map())
    expect(serializeNetworkMapContent(map)).not.toHaveProperty('linkMergeThreshold')
  })
})
