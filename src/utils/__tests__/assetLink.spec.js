import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ASSET_LINK_TARGET_CLASSES,
  assetLinkPayload,
  componentAssetMenuItems,
  objectAssetQuery,
  replacedLinks,
} from '../assetLink'

const NODE = { id: 502, name: 'web-01', class: 'Node' }
const ASSET = { id: 851, name: 'srv-dc-02', linkedObjectId: 0, componentSerial: '' }

describe('assetLinkPayload', () => {
  it('sends updateIdentification for a link to the object itself', () => {
    expect(assetLinkPayload({ objectId: 502, updateIdentification: true })).toEqual({
      objectId: 502,
      updateIdentification: true,
    })
    expect(assetLinkPayload({ objectId: 502, updateIdentification: false })).toEqual({
      objectId: 502,
      updateIdentification: false,
    })
  })

  it('updates identification unless told otherwise, as legacy always does', () => {
    expect(assetLinkPayload({ objectId: 502 })).toEqual({
      objectId: 502,
      updateIdentification: true,
    })
  })

  it('sends the serial and no updateIdentification for a component link', () => {
    expect(
      assetLinkPayload({
        objectId: 502,
        componentSerial: 'S6KNNE0T512345',
        updateIdentification: false,
      }),
    ).toEqual({ objectId: 502, componentSerial: 'S6KNNE0T512345' })
  })

  it('treats an empty serial as a link to the object', () => {
    expect(assetLinkPayload({ objectId: 502, componentSerial: '' })).toEqual({
      objectId: 502,
      updateIdentification: true,
    })
  })
})

describe('objectAssetQuery', () => {
  it('tests the class before reading asset attributes, and skips component links', () => {
    const query = objectAssetQuery('502')
    expect(query.indexOf('type != ASSET')).toBeLessThan(query.indexOf('$object->'))
    expect(query).toContain('$object->linkedObjectId == 502')
    expect(query).toContain('$object->componentSerial == ""')
  })
})

describe('replacedLinks', () => {
  it('is empty when nothing is replaced', () => {
    expect(replacedLinks({ asset: ASSET, target: NODE })).toEqual([])
  })

  it('names the object an asset leaves', () => {
    const asset = { ...ASSET, linkedObjectId: 516 }
    expect(replacedLinks({ asset, assetLinkName: 'blade-01', target: NODE })).toEqual([
      'Asset "srv-dc-02" is linked to "blade-01"; this removes that link.',
    ])
  })

  it('names the component an asset leaves', () => {
    const asset = { ...ASSET, linkedObjectId: 516, componentSerial: 'CZJ0450ABC' }
    expect(replacedLinks({ asset, assetLinkName: 'blade-01', target: NODE })).toEqual([
      'Asset "srv-dc-02" is linked to component CZJ0450ABC of "blade-01"; this removes that link.',
    ])
  })

  it('falls back to the id when the linked object cannot be named', () => {
    const asset = { ...ASSET, linkedObjectId: 516 }
    expect(replacedLinks({ asset, target: NODE })[0]).toContain('linked to "[516]"')
  })

  it('says nothing about a link that stays where it is', () => {
    const asset = { ...ASSET, linkedObjectId: 502 }
    expect(replacedLinks({ asset, target: NODE, currentAsset: { id: 851 } })).toEqual([])
  })

  it('moves an asset from a component of the target to the target itself', () => {
    const asset = { ...ASSET, linkedObjectId: 502, componentSerial: 'S6KNNE0T512345' }
    expect(replacedLinks({ asset, assetLinkName: 'web-01', target: NODE })).toEqual([
      'Asset "srv-dc-02" is linked to component S6KNNE0T512345 of "web-01"; this removes that link.',
    ])
  })

  it('warns that the object loses its current asset', () => {
    expect(
      replacedLinks({ asset: ASSET, target: NODE, currentAsset: { id: 853, name: 'spare' } }),
    ).toEqual(['"web-01" is linked to asset "spare", which will be unlinked.'])
  })

  it('says a component keeps its current asset, as the server does', () => {
    expect(
      replacedLinks({
        asset: ASSET,
        target: NODE,
        componentSerial: 'S6KNNE0T512345',
        currentAsset: { id: 853, name: 'spare' },
      }),
    ).toEqual(['Component S6KNNE0T512345 is already linked to asset "spare", which stays linked.'])
  })

  it('lists both when both sides are replaced', () => {
    const asset = { ...ASSET, linkedObjectId: 516 }
    expect(
      replacedLinks({
        asset,
        assetLinkName: 'blade-01',
        target: NODE,
        currentAsset: { id: 853, name: 'spare' },
      }),
    ).toHaveLength(2)
  })
})

describe('componentAssetMenuItems', () => {
  afterEach(() => vi.restoreAllMocks())

  const ROW = { serial: 'S6KNNE0T512345', assetId: null, asset: null }

  it('offers nothing without a serial number or without Modify', () => {
    expect(componentAssetMenuItems(NODE, { ...ROW, serial: null }, true)).toEqual([])
    expect(componentAssetMenuItems(NODE, ROW, false)).toEqual([])
  })

  it('offers Unlink only on a component with an asset', () => {
    expect(componentAssetMenuItems(NODE, ROW, true).map((i) => i.label)).toEqual([
      'Link to asset...',
    ])
    const linked = { ...ROW, assetId: 853, asset: 'spare-ssd-01' }
    expect(componentAssetMenuItems(NODE, linked, true).map((i) => i.label)).toEqual([
      'Link to asset...',
      'Unlink from asset',
    ])
  })

  it('names the node, the component and the asset in the events', () => {
    const dispatch = vi.spyOn(document, 'dispatchEvent')
    const linked = { ...ROW, assetId: 853, asset: 'spare-ssd-01' }
    const [linkItem, unlinkItem] = componentAssetMenuItems(NODE, linked, true)

    linkItem.command()
    unlinkItem.command()

    const [linkEvent, unlinkEvent] = dispatch.mock.calls.map(([event]) => event)
    expect(linkEvent.type).toBe('asset:linkToAsset')
    expect(linkEvent.detail).toEqual({ object: NODE, component: { serial: 'S6KNNE0T512345' } })
    expect(unlinkEvent.type).toBe('asset:unlinkFromAsset')
    expect(unlinkEvent.detail).toEqual({
      object: NODE,
      component: { serial: 'S6KNNE0T512345' },
      asset: { id: 853, name: 'spare-ssd-01' },
    })
  })
})

describe('ASSET_LINK_TARGET_CLASSES', () => {
  it('is the server list of link targets', () => {
    expect([...ASSET_LINK_TARGET_CLASSES].sort()).toEqual([
      'AccessPoint',
      'Chassis',
      'MobileDevice',
      'Node',
      'Rack',
      'Sensor',
    ])
  })
})
