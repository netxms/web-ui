/**
 * An unedited adapt -> serialize round trip of maps authored in the legacy client
 * (fixtures/legacyMapContent.js) must lose nothing the legacy client depends on.
 */
import { describe, it, expect } from 'vitest'
import {
  adaptApiNetworkMap,
  serializeNetworkMapContent,
  MAP_CONTENT_SETTING_KEYS,
  hexToBgrInt,
  nextElementId,
  createObjectElement,
  createGroupBoxElement,
  createTextBoxElement,
  createDciContainerElement,
  createDciImageElement,
  createMapLink,
  mergeTextBoxEdit,
  mergeDecorationEdit,
  mergeDciContainerEdit,
  mergeDciImageEdit,
  mergeLinkEdit,
  MAP_LINK_COLOR_SOURCES,
  LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE,
  MAP_FLAGS,
  MAP_FLAG_JSON_KEYS,
  parseMapFlags,
  serializeMapFlags,
} from '@/utils/networkMapAdapters'
import { useNetworkMapEditor } from '@/composables/useNetworkMapEditor'
import { LEGACY_MAP_CONTENT, toPutShape } from './fixtures/legacyMapContent'

const API_MAP = { id: 4201, name: 'Legacy corpus map', class: 'NetworkMap', ...LEGACY_MAP_CONTENT }

function adapt(apiMap = API_MAP) {
  return adaptApiNetworkMap(structuredClone(apiMap), new Map())
}

function roundTrip(apiMap = API_MAP) {
  return serializeNetworkMapContent(adapt(apiMap))
}

describe('legacy map corpus round-trip', () => {
  it('covers every MAP_ELEMENT_* type', () => {
    const corpusTypes = new Set(LEGACY_MAP_CONTENT.elements.map((e) => e.type))
    for (const apiType of [0, 1, 2, 3, 4, 5]) {
      expect(corpusTypes.has(apiType), `corpus is missing element type ${apiType}`).toBe(true)
    }
  })

  it('serializes back to the exact PUT shape of the corpus', () => {
    // Plus the legacy PUT key variants (TextBox/DCIList) the server's JSON constructors require.
    expect(roundTrip()).toEqual(toPutShape(LEGACY_MAP_CONTENT))
  })

  it('always emits both elements and links keys (server clears links otherwise)', () => {
    const empty = serializeNetworkMapContent(
      adaptApiNetworkMap({ id: 1, name: 'x', elements: [], links: [] }, new Map()),
    )
    expect(empty.elements).toEqual([])
    expect(empty.links).toEqual([])
  })

  it('preserves every map-level setting verbatim, including defaultLinkWidht', () => {
    const serialized = roundTrip()
    for (const key of MAP_CONTENT_SETTING_KEYS) {
      if (LEGACY_MAP_CONTENT[key] === undefined) continue
      // Unset NXSL scripts arrive as null but must be PUT as '' (strict server check)
      const expected =
        (key === 'filter' || key === 'linkScript') && LEGACY_MAP_CONTENT[key] === null
          ? ''
          : LEGACY_MAP_CONTENT[key]
      expect(serialized[key], `setting ${key}`).toEqual(expected)
    }
    expect(serialized.defaultLinkWidht).toBe(2)
    expect(serialized).not.toHaveProperty('defaultLinkWidth')
  })

  it('preserves unmodeled element keys verbatim', () => {
    const apiMap = structuredClone(API_MAP)
    apiMap.elements[1].futureField = { nested: ['keep', 'me'] }
    const serialized = serializeNetworkMapContent(adapt(apiMap))
    const el = serialized.elements.find((e) => e.id === apiMap.elements[1].id)
    expect(el.futureField).toEqual({ nested: ['keep', 'me'] })
  })

  it('preserves dangling links (unrenderable but still map content)', () => {
    const map = adapt()
    const dangling = map.links.find((l) => l.raw.element2 === 999)
    expect(dangling).toBeDefined()
    expect(dangling.from).toBe('e-2')
    expect(dangling.to).toBeNull()

    const serialized = serializeNetworkMapContent(map)
    expect(serialized.links.find((l) => l.element2 === 999)).toEqual(
      LEGACY_MAP_CONTENT.links.find((l) => l.element2 === 999),
    )
  })

  it('merges position overrides into the targeted element only', () => {
    const map = adapt()
    const overrides = new Map([['e-2', { x: 333.4, y: 111.6 }]])
    const serialized = serializeNetworkMapContent(map, overrides)

    const moved = serialized.elements.find((e) => e.id === 2)
    expect(moved.posX).toBe(333)
    expect(moved.posY).toBe(112)

    for (const el of serialized.elements.filter((e) => e.id !== 2)) {
      const orig = LEGACY_MAP_CONTENT.elements.find((e) => e.id === el.id)
      expect({ x: el.posX, y: el.posY }).toEqual({ x: orig.posX, y: orig.posY })
    }
  })
})

describe('editor round-trip losslessness', () => {
  it('appends new elements (id = max+1) and leaves existing elements byte-identical', () => {
    const map = adapt()
    const baseId = nextElementId(map) // corpus max id is 8
    expect(baseId).toBe(9)
    const obj = createObjectElement({ id: baseId, objectId: 500, x: 100, y: 100 })
    const gb = createGroupBoxElement({ id: baseId + 1, x: 200, y: 200 })
    const tb = createTextBoxElement({ id: baseId + 2, x: 300, y: 300 })
    const serialized = serializeNetworkMapContent({
      ...map,
      elements: [...map.elements, obj, gb, tb],
    })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    expect(serialized.elements.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    const newTb = serialized.elements.find((e) => e.id === 11)
    expect(newTb.type).toBe(5)
    expect(newTb.TextBox).toBe(newTb.config)
  })

  it('editing a text box changes only that element', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-8')
    elements[idx] = mergeTextBoxEdit(elements[idx], { text: 'CHANGED' })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 8) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const tb = serialized.elements.find((e) => e.id === 8)
    expect(JSON.parse(tb.config).text).toBe('CHANGED')
    expect(tb.TextBox).toBe(tb.config)
  })

  it('editing a group box updates only its title/color', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-4')
    elements[idx] = mergeDecorationEdit(elements[idx], { label: 'Edge', color: '#010203' })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const gb = serialized.elements.find((e) => e.id === 4)
    expect(gb.title).toBe('Edge')
    expect(gb.color).toBe(hexToBgrInt('#010203'))
    expect(gb.width).toBe(460)
    expect(gb.height).toBe(240)
  })

  it('editing a link changes only that link', () => {
    const map = adapt()
    const links = map.links.slice()
    // Corpus link 0: element 2 -> 3, config with bendPoints + dciList
    links[0] = mergeLinkEdit(links[0], { label: 'renamed', style: 4, width: 7 })
    const serialized = serializeNetworkMapContent({ ...map, links })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (let i = 1; i < expected.links.length; i++) {
      expect(serialized.links[i]).toEqual(expected.links[i])
    }
    const edited = serialized.links[0]
    expect(edited.name).toBe('renamed')
    const cfg = JSON.parse(edited.config)
    expect(cfg.style).toBe(4)
    expect(cfg.width).toBe(7)
    // Everything unpatched survives the config regeneration verbatim
    const origCfg = JSON.parse(LEGACY_MAP_CONTENT.links[0].config)
    expect(cfg.bendPoints).toEqual(origCfg.bendPoints)
    expect(cfg.dciList).toEqual(origCfg.dciList)
    expect(cfg.objectStatusList).toEqual(origCfg.objectStatusList)
    expect(edited.connectorName1).toBe('eth0')
    expect(edited.interface1).toBe(201)
  })

  it('editing the full text box field set changes only that element', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-8')
    elements[idx] = mergeTextBoxEdit(elements[idx], {
      fontSize: 18,
      borderRequired: false,
      drillDownObjectId: 555,
      backgroundColor: '#010203',
      textColor: '#040506',
      borderColor: '#070809',
    })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 8) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const tb = serialized.elements.find((e) => e.id === 8)
    const cfg = JSON.parse(tb.config)
    expect(cfg.fontSize).toBe(18)
    expect(cfg.borderRequired).toBe(false)
    expect(cfg.drillDownObjectId).toBe(555)
    expect(cfg.backgroundColor).toBe(hexToBgrInt('#010203'))
    expect(cfg.textColor).toBe(hexToBgrInt('#040506'))
    expect(cfg.borderColor).toBe(hexToBgrInt('#070809'))
    expect(tb.TextBox).toBe(tb.config)
  })

  it('resizing a group box changes only its geometry (title/color untouched)', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-4')
    elements[idx] = mergeDecorationEdit(elements[idx], { x: 15, y: 25, width: 640, height: 400 })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 4) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const gb = serialized.elements.find((e) => e.id === 4)
    expect(gb.posX).toBe(15)
    expect(gb.posY).toBe(25)
    expect(gb.width).toBe(640)
    expect(gb.height).toBe(400)
    const orig = LEGACY_MAP_CONTENT.elements.find((e) => e.id === 4)
    expect(gb.title).toBe(orig.title)
    expect(gb.color).toBe(orig.color)
  })

  it('editing an image decoration changes only its guid + size', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-5')
    elements[idx] = mergeDecorationEdit(elements[idx], {
      imageGuid: 'new-image-guid',
      width: 96,
      height: 96,
    })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 5) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const img = serialized.elements.find((e) => e.id === 5)
    expect(img.title).toBe('new-image-guid')
    expect(img.width).toBe(96)
    expect(img.height).toBe(96)
  })

  it('editing the full link field set changes only that link', () => {
    const map = adapt()
    const links = map.links.slice()
    links[0] = mergeLinkEdit(links[0], {
      connectorName1: 'xe-0/0/0',
      connectorName2: 'xe-0/0/1',
      interface1: 900,
      interface2: 901,
      colorSource: MAP_LINK_COLOR_SOURCES.CUSTOM,
      customColor: '#010203',
      colorProvider: 'CustomProvider',
      excludeFromAutoUpdate: true,
      routing: 2,
      labelPosition: 25,
      useActiveThresholds: false,
      useInterfaceUtilization: true,
      objectStatusList: [201, 202],
    })
    const serialized = serializeNetworkMapContent({ ...map, links })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (let i = 1; i < expected.links.length; i++) {
      expect(serialized.links[i]).toEqual(expected.links[i])
    }
    const edited = serialized.links[0]
    expect(edited.connectorName1).toBe('xe-0/0/0')
    expect(edited.connectorName2).toBe('xe-0/0/1')
    expect(edited.interface1).toBe(900)
    expect(edited.interface2).toBe(901)
    expect(edited.colorSource).toBe(MAP_LINK_COLOR_SOURCES.CUSTOM)
    expect(edited.color).toBe(hexToBgrInt('#010203'))
    expect(edited.colorProvider).toBe('CustomProvider')
    expect(edited.flags & LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE).toBeTruthy()
    const cfg = JSON.parse(edited.config)
    expect(cfg.routing).toBe(2)
    expect(cfg.labelPosition).toBe(25)
    expect(cfg.useActiveThresholds).toBe(false)
    expect(cfg.useInterfaceUtilization).toBe(true)
    expect(cfg.objectStatusList).toEqual([201, 202])
    // Unmodeled config keys survive the regeneration
    const origCfg = JSON.parse(LEGACY_MAP_CONTENT.links[0].config)
    expect(cfg.bendPoints).toEqual(origCfg.bendPoints)
    expect(cfg.dciList).toEqual(origCfg.dciList)
  })

  it('editing link bend points round-trips through the legacy flat array', () => {
    const map = adapt()
    const links = map.links.slice()
    links[0] = mergeLinkEdit(links[0], {
      bendPoints: [
        { x: 111, y: 222 },
        { x: 333, y: 444 },
        { x: 555, y: 666 },
      ],
    })
    const serialized = serializeNetworkMapContent({ ...map, links })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (let i = 1; i < expected.links.length; i++) {
      expect(serialized.links[i]).toEqual(expected.links[i])
    }
    const cfg = JSON.parse(serialized.links[0].config)
    expect(cfg.bendPoints).toEqual([111, 222, 333, 444, 555, 666])
    const origCfg = JSON.parse(LEGACY_MAP_CONTENT.links[0].config)
    expect(cfg.dciList).toEqual(origCfg.dciList)
    expect(cfg.objectStatusList).toEqual(origCfg.objectStatusList)
    expect(cfg.routing).toBe(origCfg.routing)
  })

  it('adding a link appends it and keeps existing links byte-identical', () => {
    const map = adapt()
    const fromElement = map.elements.find((e) => e.id === 'e-2')
    const toElement = map.elements.find((e) => e.id === 'e-3')
    const link = createMapLink({ id: 'l-99', fromElement, toElement })
    const serialized = serializeNetworkMapContent({ ...map, links: [...map.links, link] })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    expect(serialized.links).toHaveLength(expected.links.length + 1)
    for (let i = 0; i < expected.links.length; i++) {
      expect(serialized.links[i]).toEqual(expected.links[i])
    }
    expect(serialized.links.at(-1)).toMatchObject({ element1: 2, element2: 3, config: '' })
  })

  it('removing a link drops it and keeps the rest identical', () => {
    const map = adapt()
    const serialized = serializeNetworkMapContent({
      ...map,
      links: map.links.filter((l) => l.id !== 'l-1'),
    })
    const expected = toPutShape(LEGACY_MAP_CONTENT)
    expect(serialized.links).toHaveLength(expected.links.length - 1)
    expect(serialized.links).toEqual(expected.links.filter((_, i) => i !== 1))
  })

  it('removing an element drops it and keeps the rest identical', () => {
    const map = adapt()
    const serialized = serializeNetworkMapContent({
      ...map,
      elements: map.elements.filter((e) => e.id !== 'e-1'),
    })
    const expected = toPutShape(LEGACY_MAP_CONTENT)
    expect(serialized.elements.find((e) => e.id === 1)).toBeUndefined()
    for (const el of expected.elements) {
      if (el.id === 1) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
  })

  it('appends DCI container/image elements and leaves existing elements byte-identical', () => {
    const map = adapt()
    const baseId = nextElementId(map) // corpus max id is 8
    const dc = createDciContainerElement({ id: baseId, x: 100, y: 100 })
    const di = createDciImageElement({ id: baseId + 1, x: 200, y: 200 })
    const serialized = serializeNetworkMapContent({
      ...map,
      elements: [...map.elements, dc, di],
    })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const newDc = serialized.elements.find((e) => e.id === baseId)
    expect(newDc.type).toBe(3)
    expect(newDc.DCIList).toBe(newDc.dciList)
    const newDi = serialized.elements.find((e) => e.id === baseId + 1)
    expect(newDi.type).toBe(4)
    expect(newDi.DCIList).toBe(newDi.dciList)
  })

  it('editing a DCI container changes only that element and preserves its DCI entries', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-6')
    elements[idx] = mergeDciContainerEdit(elements[idx], {
      borderRequired: false,
      backgroundColor: '#010203',
    })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 6) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const dc = serialized.elements.find((e) => e.id === 6)
    const cfg = JSON.parse(dc.dciList)
    expect(cfg.borderRequired).toBe(false)
    expect(cfg.backgroundColor).toBe(hexToBgrInt('#010203'))
    expect(cfg.dciList).toHaveLength(2) // unedited data sources preserved
    expect(dc.DCIList).toBe(dc.dciList)
  })

  it('editing a DCI image changes only that element and preserves its rules/metric', () => {
    const map = adapt()
    const elements = map.elements.slice()
    const idx = elements.findIndex((e) => e.id === 'e-7')
    elements[idx] = mergeDciImageEdit(elements[idx], { defaultImage: 'new-default-guid' })
    const serialized = serializeNetworkMapContent({ ...map, elements })
    const expected = toPutShape(LEGACY_MAP_CONTENT)

    for (const el of expected.elements) {
      if (el.id === 7) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
    const di = serialized.elements.find((e) => e.id === 7)
    const cfg = JSON.parse(di.dciList)
    expect(cfg.defaultImage).toBe('new-default-guid')
    expect(cfg.dciRuleList).toHaveLength(1) // unedited rule preserved
    expect(cfg.dci.dciId).toBe(2003) // unedited metric preserved
    expect(di.DCIList).toBe(di.dciList)
  })

  it('removing a DCI container/image drops them and keeps the rest identical', () => {
    const map = adapt()
    const serialized = serializeNetworkMapContent({
      ...map,
      elements: map.elements.filter((e) => e.id !== 'e-6' && e.id !== 'e-7'),
    })
    const expected = toPutShape(LEGACY_MAP_CONTENT)
    expect(serialized.elements.find((e) => e.id === 6)).toBeUndefined()
    expect(serialized.elements.find((e) => e.id === 7)).toBeUndefined()
    for (const el of expected.elements) {
      if (el.id === 6 || el.id === 7) continue
      expect(serialized.elements.find((e) => e.id === el.id)).toEqual(el)
    }
  })
})

describe('map settings round-trip', () => {
  it('updateMapSettings merges rawContent keys and serializes them losslessly', () => {
    const editor = useNetworkMapEditor()
    editor.enter(adapt())
    editor.updateMapSettings({
      canvasType: 1,
      objectDisplayMode: 2,
      displayPriority: 7,
      backgroundColor: '#010203', // hex string -> BGR int via updateMapSettings
      defaultLinkWidht: 5,
    })
    const serialized = serializeNetworkMapContent(editor.working.value)

    expect(serialized.canvasType).toBe(1)
    expect(serialized.objectDisplayMode).toBe(2)
    expect(serialized.displayPriority).toBe(7)
    expect(serialized.backgroundColor).toBe(hexToBgrInt('#010203'))
    expect(serialized.defaultLinkWidht).toBe(5)
    // Unrelated settings survive untouched
    expect(serialized.mapType).toBe(LEGACY_MAP_CONTENT.mapType)
    expect(serialized.filter).toBe(LEGACY_MAP_CONTENT.filter)
    // GET-null scripts are still PUT as '' after a settings edit
    expect(serialized.linkScript).toBe('')
    editor.exit()
  })
})

describe('legacy map corpus adaptation', () => {
  const map = adapt()

  it('adapts every element with raw preserved', () => {
    expect(map.elements).toHaveLength(LEGACY_MAP_CONTENT.elements.length)
    for (const el of map.elements) {
      expect(el.raw).toEqual(LEGACY_MAP_CONTENT.elements.find((e) => `e-${e.id}` === el.id))
    }
  })

  it('maps element types to internal keys', () => {
    const byId = Object.fromEntries(map.elements.map((e) => [e.id, e.type]))
    expect(byId['e-1']).toBe('generic')
    expect(byId['e-2']).toBe('object')
    expect(byId['e-4']).toBe('decoration')
    expect(byId['e-6']).toBe('dci-container')
    expect(byId['e-7']).toBe('dci-image')
    expect(byId['e-8']).toBe('text-box')
  })

  it('decodes decoration fields including the BGR title color', () => {
    const box = map.elements.find((e) => e.id === 'e-4')
    expect(box.decorationType).toBe('group-box')
    expect(box.label).toBe('Core segment')
    expect(box.width).toBe(460)
    expect(box.height).toBe(240)
    expect(box.style.color).toBe('#d6d6d6')

    const image = map.elements.find((e) => e.id === 'e-5')
    expect(image.decorationType).toBe('image')
  })

  it('decodes link custom colors as BGR (red in the low byte)', () => {
    const custom = map.links.find((l) => l.raw.colorSource === 2)
    expect(custom.color).toBe('custom')
    expect(custom.customColor).toBe('#ff0000') // 255 = red in NetXMS BGR, not blue
  })

  it('marks status-sourced link colors', () => {
    const status = map.links.find((l) => l.raw.colorSource === 1)
    expect(status.color).toBe('status')
  })

  it('models the full editable link field set from raw + config', () => {
    const link = map.links[0]
    expect(link.connectorName1).toBe('eth0')
    expect(link.connectorName2).toBe('ge-0/0/1')
    expect(link.interface1).toBe(201)
    expect(link.interface2).toBe(301)
    expect(link.routing).toBe(3)
    expect(link.style).toBe(1)
    expect(link.width).toBe(3)
    expect(link.labelPosition).toBe(50)
    expect(link.useActiveThresholds).toBe(true)
    expect(link.objectStatusList).toEqual([101, 102])
    expect(link.dciList).toHaveLength(1)
    expect(link.dciList[0].dciId).toBe(2001)
    expect(link.bendPoints).toEqual([
      { x: 350, y: 180 },
      { x: 420, y: 260 },
    ])
    expect(link.excludeFromAutoUpdate).toBe(false)
  })

  it('falls back to LinkConfig defaults for links with an empty config string', () => {
    const empty = map.links.find((l) => l.raw.config === '' && l.raw.colorSource === 3)
    expect(empty.routing).toBe(0)
    expect(empty.style).toBe(0)
    expect(empty.width).toBe(0)
    expect(empty.labelPosition).toBe(50)
    expect(empty.objectStatusList).toEqual([])
    expect(empty.dciList).toEqual([])
    expect(empty.bendPoints).toEqual([])
    expect(empty.colorProvider).toBe('MapLinkColor')
  })
})

/** Current servers send `flags` as an object of booleans, older ones as a raw integer. */
describe('map flags', () => {
  const BOTH = MAP_FLAGS.SHOW_STATUS_ICON | MAP_FLAGS.FIT_TO_SCREEN

  it('parses the boolean-object form emitted by current servers', () => {
    expect(parseMapFlags({ showStatusIcon: true, fitToScreen: true })).toBe(BOTH)
  })

  it('parses the raw integer form emitted by pre-1a59cce3 servers', () => {
    expect(parseMapFlags(BOTH)).toBe(BOTH)
  })

  it('treats a missing or malformed flags field as no flags set', () => {
    expect(parseMapFlags(undefined)).toBe(0)
    expect(parseMapFlags(null)).toBe(0)
    expect(parseMapFlags('nonsense')).toBe(0)
  })

  it('ignores false and unknown keys rather than setting bits', () => {
    expect(parseMapFlags({ showStatusIcon: false, someFutureFlag: true })).toBe(0)
  })

  it('serializes every modeled bit so the value is unambiguous under PATCH semantics', () => {
    const out = serializeMapFlags(BOTH)
    expect(Object.keys(out).sort()).toEqual(Object.values(MAP_FLAG_JSON_KEYS).sort())
    expect(out.showStatusIcon).toBe(true)
    expect(out.fitToScreen).toBe(true)
    expect(out.showTraffic).toBe(false)
  })

  it('round-trips a bitmask through both directions', () => {
    const all = Object.values(MAP_FLAGS).reduce((a, b) => a | b, 0)
    for (const flags of [0, BOTH, all]) {
      expect(parseMapFlags(serializeMapFlags(flags))).toBe(flags)
    }
  })

  it('adapts flags to a bitmask and preserves the raw form for serialization', () => {
    const apiMap = { ...API_MAP, flags: { showStatusIcon: true, calculateStatus: true } }
    const map = adapt(apiMap)
    expect(map.flags).toBe(MAP_FLAGS.SHOW_STATUS_ICON | MAP_FLAGS.CALCULATE_STATUS)
    expect(serializeNetworkMapContent(map).flags).toEqual(apiMap.flags)
  })

  it('preserves the legacy integer flags form verbatim on an unedited round trip', () => {
    const serialized = roundTrip({ ...API_MAP, flags: 5 })
    expect(serialized.flags).toBe(5)
  })
})

/** Older servers spell the key "defaultLinkWidht"; a round trip echoes the server's spelling. */
describe('defaultLinkWidth key spelling', () => {
  it('echoes the modern spelling back when the server uses it', () => {
    const apiMap = { ...API_MAP, defaultLinkWidht: undefined, defaultLinkWidth: 7 }
    delete apiMap.defaultLinkWidht
    const serialized = roundTrip(apiMap)
    expect(serialized.defaultLinkWidth).toBe(7)
    expect(serialized).not.toHaveProperty('defaultLinkWidht')
  })
})
