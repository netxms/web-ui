import { describe, it, expect } from 'vitest'
import {
  adaptObject,
  adaptDciValue,
  adaptDciCurrentValues,
  adaptRackLayout,
  passiveElementToApiPayload,
  rackPlacementToApiPayload,
  chassisPlacementToApiPayload,
  objectToPhysicalPlacementPayload,
} from '../objectAdapters'
import { formatDciValue } from '@/utils/dciFormat'

describe('adaptObject', () => {
  it("extracts uin (the zone's own zoneUIN) for Zone objects", () => {
    const zone = adaptObject({ id: 3, class: 'Zone', name: 'Zone A', uin: 42 })
    expect(zone.uin).toBe(42)
  })

  it('defaults uin to 0 when missing on a Zone object', () => {
    const zone = adaptObject({ id: 3, class: 'Zone', name: 'Zone A' })
    expect(zone.uin).toBe(0)
  })

  it('does not surface uin for unrelated classes', () => {
    const container = adaptObject({ id: 4, class: 'Container', name: 'Group' })
    expect(container.uin).toBeUndefined()
  })

  it('carries the effective rights booleans through', () => {
    const effectiveRights = { read: true, modify: false, executeScript: true }
    const node = adaptObject({ id: 5, class: 'Node', name: 'n', effectiveRights })
    expect(node.effectiveRights).toEqual(effectiveRights)
  })

  it('keeps missing effective rights null, distinct from a document denying everything', () => {
    // null = the server said nothing, which callers read as "allowed"; all-false = no rights.
    expect(adaptObject({ id: 5, class: 'Node', name: 'n' }).effectiveRights).toBeNull()
    expect(
      adaptObject({ id: 5, class: 'Node', name: 'n', effectiveRights: { read: false } })
        .effectiveRights,
    ).toEqual({ read: false })
  })

  it('reads agent and SNMP settings from their nested groups', () => {
    const node = adaptObject({
      id: 100,
      class: 'Node',
      name: 'core-sw-01',
      sshPort: 22,
      agent: { port: 4700, proxy: 7 },
      snmp: { version: '2c', port: 161, proxy: 9, authName: 'public' },
    })
    expect(node.agentPort).toBe(4700)
    expect(node.agentProxyNodeId).toBe(7)
    expect(node.snmpVersion).toBe('2c')
    expect(node.snmpPort).toBe(161)
    expect(node.snmpProxyNodeId).toBe(9)
    expect(node.snmpCommunity).toBe('public')
  })

  it('reports no SNMP port rather than inventing 161 when the server sends none', () => {
    const node = adaptObject({ id: 100, class: 'Node', name: 'n' })
    expect(node.snmpPort).toBe(0)
    expect(node.agentPort).toBe(0)
    expect(node.snmpVersion).toBeNull()
  })

  it('passes pollStates through, and defaults to null for non-pollable objects', () => {
    const states = [{ name: 'status', pending: false, lastCompleted: '2026-07-30T12:53:33Z' }]
    expect(
      adaptObject({ id: 100, class: 'Node', name: 'n', pollStates: states }).pollStates,
    ).toEqual(states)
    expect(adaptObject({ id: 4, class: 'Container', name: 'Group' }).pollStates).toBeNull()
  })
})

describe('adaptObject context view fields', () => {
  it('reads the dashboard object-context flags', () => {
    const dashboard = adaptObject({
      id: 5,
      class: 'Dashboard',
      showAsObjectView: true,
      showContextSelector: true,
      forcedContextObjectId: 12,
      displayPriority: 3,
    })
    expect(dashboard).toMatchObject({
      showAsObjectView: true,
      showContextSelector: true,
      forcedContextObjectId: 12,
      displayPriority: 3,
      objectContextFlagsSupported: true,
    })
  })

  it('defaults the dashboard flags off, and says when the server did not report them', () => {
    const dashboard = adaptObject({ id: 5, class: 'Dashboard' })
    expect(dashboard).toMatchObject({
      showAsObjectView: false,
      showContextSelector: false,
      forcedContextObjectId: 0,
      objectContextFlagsSupported: false,
    })
  })

  it('reports supported flags that are switched off', () => {
    const dashboard = adaptObject({ id: 5, class: 'Dashboard', showAsObjectView: false })
    expect(dashboard.objectContextFlagsSupported).toBe(true)
  })

  it('reads the network map object-view flag from the boolean flags object', () => {
    const map = adaptObject({ id: 6, class: 'NetworkMap', flags: { showAsObjectView: true } })
    expect(map.showAsObjectView).toBe(true)
  })

  it('reads the network map object-view flag from an integer flags field', () => {
    expect(adaptObject({ id: 6, class: 'NetworkMap', flags: 0x2000 }).showAsObjectView).toBe(true)
    expect(adaptObject({ id: 6, class: 'NetworkMap' }).showAsObjectView).toBe(false)
  })
})

describe('passiveElementToApiPayload', () => {
  it('converts a bottom-anchored multi-U slot to the topmost-unit position (bottom-up numbering)', () => {
    // slot 10 = bottom-most unit of a 2U element -> occupies units 10-11, topmost = 11
    const payload = passiveElementToApiPayload(
      {
        label: 'PDU 1',
        passiveType: 'PDU',
        slot: 10,
        heightU: 2,
        orientation: 'front',
        portCount: 24,
        frontImageGuid: 'a1111111-1111-1111-1111-111111111111',
        backImageGuid: null,
      },
      12,
      false,
    )
    expect(payload).toEqual({
      name: 'PDU 1',
      type: 3,
      position: 11,
      height: 2,
      orientation: 1,
      portCount: 24,
      imageFront: 'a1111111-1111-1111-1111-111111111111',
      imageRear: '00000000-0000-0000-0000-000000000000',
    })
  })

  it('converts slot to position under top-down numbering too', () => {
    // rackHeight 12, topBottomNumbering: unit 1 at physical top. slot 9 (canonical bottom-up,
    // bottom-most unit of a 3U element) -> occupies canonical units 9-11 -> top-down position 2
    const payload = passiveElementToApiPayload(
      { label: 'PDU', passiveType: 'PDU', slot: 9, heightU: 3, orientation: 'full' },
      12,
      true,
    )
    expect(payload.position).toBe(2)
  })

  it('defaults images to the null guid and portCount to 0 when unset', () => {
    const payload = passiveElementToApiPayload(
      { label: 'Filler', passiveType: 'FilterPanel', slot: 1, heightU: 1, orientation: 'full' },
      12,
      false,
    )
    expect(payload.imageFront).toBe('00000000-0000-0000-0000-000000000000')
    expect(payload.imageRear).toBe('00000000-0000-0000-0000-000000000000')
    expect(payload.portCount).toBe(0)
    expect(payload.type).toBe(1)
    expect(payload.orientation).toBe(0)
  })
})

describe('rackPlacementToApiPayload', () => {
  /** Adapted rack element as RackCanvas hands it back: internal bottom-up "slot". */
  function element(overrides = {}) {
    return {
      objectId: 27710,
      slot: 5,
      heightU: 2,
      orientation: 'front',
      frontImageGuid: 'fd21a79f-e8d4-4c28-bf07-81b5fce4a26a',
      backImageGuid: null,
      ...overrides,
    }
  }

  it('emits the physicalPlacement group, not the old flat rack keys', () => {
    const payload = rackPlacementToApiPayload(326, element(), 42, false)
    expect(payload.containerId).toBe(326)
    expect(payload.rackId).toBeUndefined()
    expect(payload.rackPosition).toBeUndefined()
  })

  it('converts the internal slot into the rack position for bottom-up numbering', () => {
    // Bottom-up: position names the element's topmost unit, slot 5 + 2U spans 5..6.
    const payload = rackPlacementToApiPayload(326, element(), 42, false)
    expect(payload.position).toBe(6)
    expect(payload.height).toBe(2)
  })

  it('converts the internal slot into the rack position for top-down numbering', () => {
    const payload = rackPlacementToApiPayload(326, element(), 42, true)
    expect(payload.position).toBe(37)
  })

  it('maps the orientation name onto the server integer', () => {
    expect(
      rackPlacementToApiPayload(326, element({ orientation: 'full' }), 42, false).orientation,
    ).toBe(0)
    expect(
      rackPlacementToApiPayload(326, element({ orientation: 'front' }), 42, false).orientation,
    ).toBe(1)
    expect(
      rackPlacementToApiPayload(326, element({ orientation: 'back' }), 42, false).orientation,
    ).toBe(2)
  })

  it('carries the front and rear images the add/edit dialog collects', () => {
    // The dialog offers image pickers for object-backed elements.
    const payload = rackPlacementToApiPayload(326, element(), 42, false)
    expect(payload.imageFront).toBe('fd21a79f-e8d4-4c28-bf07-81b5fce4a26a')
    expect(payload.imageRear).toBeNull()
  })

  it('unplaces with containerId alone', () => {
    // Geometry is validated whenever position or height is present, so an object stored at
    // an out-of-range position could not be removed if we sent them here.
    expect(rackPlacementToApiPayload(null, null)).toEqual({ containerId: null })
  })
})

describe('chassisPlacementToApiPayload', () => {
  function element(overrides = {}) {
    return {
      objectId: 27710,
      x: 2,
      y: 1,
      width: 10,
      height: 1,
      orientation: 'front',
      frontImageGuid: null,
      ...overrides,
    }
  }

  it('nests the geometry under chassisPlacement with the container id', () => {
    const payload = chassisPlacementToApiPayload(500, element())
    expect(payload.containerId).toBe(500)
    expect(payload.chassisId).toBeUndefined()
    expect(payload.chassisPlacement).toMatchObject({
      width: 10,
      widthUnits: 0,
      height: 1,
      heightUnits: 0,
      positionWidth: 2,
      positionWidthUnits: 0,
      positionHeight: 1,
      positionHeightUnits: 0,
      orientation: 1,
    })
  })

  it('rounds every dimension to an integer', () => {
    // The mm adapter divides by 5.08 / 44.45, so an element read back in mm carries
    // fractions. ValidateChassisPlacementJson rejects a non-integer with 400.
    const payload = chassisPlacementToApiPayload(
      500,
      element({ x: 10.16, y: 44.45, width: 50.8, height: 88.9 }),
      'mm',
    )
    const p = payload.chassisPlacement
    expect(Number.isInteger(p.positionWidth)).toBe(true)
    expect(Number.isInteger(p.positionHeight)).toBe(true)
    expect(Number.isInteger(p.width)).toBe(true)
    expect(Number.isInteger(p.height)).toBe(true)
    expect(p.widthUnits).toBe(1)
    expect(p.heightUnits).toBe(1)
  })

  it('never sends the fill orientation, which no chassis view draws', () => {
    // 0 links the node under the chassis but puts it in neither the front nor the rear view.
    expect(
      chassisPlacementToApiPayload(500, element({ orientation: 'full' })).chassisPlacement
        .orientation,
    ).toBe(1)
    expect(
      chassisPlacementToApiPayload(500, element({ orientation: 'back' })).chassisPlacement
        .orientation,
    ).toBe(2)
  })

  it('unplaces with containerId alone', () => {
    expect(chassisPlacementToApiPayload(null, null)).toEqual({ containerId: null })
  })
})

describe('adaptRackLayout', () => {
  const NULL_GUID = '00000000-0000-0000-0000-000000000000'

  it('converts a multi-U element position (topmost unit) into a bottom-anchored slot', () => {
    const layout = adaptRackLayout({
      rackId: 1,
      name: 'R1',
      height: 12,
      topBottomNumbering: false,
      passiveElements: [
        {
          id: 1,
          name: 'PDU',
          type: 3,
          position: 11,
          height: 2,
          orientation: 1,
          portCount: 0,
          imageFront: NULL_GUID,
          imageRear: NULL_GUID,
        },
      ],
      objects: [],
    })
    // position 11 = topmost unit of a 2U element -> occupies units 10-11, canonical slot = 10
    expect(layout.elements[0].slot).toBe(10)
  })

  it('converts position into a bottom-anchored slot under top-down numbering', () => {
    const layout = adaptRackLayout({
      rackId: 1,
      name: 'R1',
      height: 12,
      topBottomNumbering: true,
      passiveElements: [
        {
          id: 1,
          name: 'PDU',
          type: 3,
          position: 2,
          height: 3,
          orientation: 1,
          portCount: 0,
          imageFront: NULL_GUID,
          imageRear: NULL_GUID,
        },
      ],
      objects: [],
    })
    expect(layout.elements[0].slot).toBe(9)
  })

  it('leaves a 1U element unaffected by the anchor conversion', () => {
    const layout = adaptRackLayout({
      rackId: 1,
      name: 'R1',
      height: 12,
      topBottomNumbering: false,
      passiveElements: [
        {
          id: 1,
          name: 'Patch Panel',
          type: 0,
          position: 12,
          height: 1,
          orientation: 0,
          portCount: 24,
          imageFront: NULL_GUID,
          imageRear: NULL_GUID,
        },
      ],
      objects: [],
    })
    expect(layout.elements[0].slot).toBe(12)
  })
})

describe('adaptDciValue', () => {
  it('marks DCO_TYPE_TABLE rows as tables', () => {
    expect(adaptDciValue({ id: 2, type: 2 }).isTable).toBe(true)
  })

  it('marks DCO_TYPE_ITEM rows as non-tables', () => {
    expect(adaptDciValue({ id: 1, type: 1 }).isTable).toBe(false)
  })

  // Released servers send `type` as a code here; netxms 302b4c6670 sends the configuration
  // endpoint's names instead.
  it("marks a row typed by the config endpoint's name 'table' as a table", () => {
    const row = adaptDciValue({ id: 3, type: 'table' })
    expect(row.isTable).toBe(true)
    expect(row.type).toBe(2)
    expect(adaptDciValue({ id: 3, type: 'item' }).isTable).toBe(false)
  })

  // Pre-847678dab4 servers inlined the table instead of sending a value summary.
  it('treats a row with no type as a non-table', () => {
    expect(adaptDciValue({ id: 4 }).isTable).toBe(false)
  })

  it('preserves every other field', () => {
    const row = adaptDciValue({ id: 5, ownerId: 7, description: 'CPU', sourceType: 1, value: '42' })
    expect(row).toMatchObject({ id: 5, ownerId: 7, description: 'CPU', sourceType: 1, value: '42' })
  })

  describe('enumerations sent as codes or names', () => {
    const NORMALIZED = { sourceType: 1, origin: 'agent', dataType: 5, status: 1, type: 1 }

    it('keeps the codes of a released server and names the origin', () => {
      const row = adaptDciValue({ id: 6, sourceType: 1, dataType: 5, status: 1, type: 1 })
      expect(row).toMatchObject(NORMALIZED)
    })

    // netxms bafe8323da: `origin` next to the numeric `sourceType`.
    it('takes a row with both sourceType and origin as sent', () => {
      const row = adaptDciValue({ id: 6, sourceType: 1, origin: 'agent', dataType: 5 })
      expect(row).toMatchObject({ sourceType: 1, origin: 'agent', dataType: 5 })
    })

    it('turns names into the codes the rest of the app reads', () => {
      const row = adaptDciValue({
        id: 6,
        origin: 'agent',
        dataType: 'float',
        status: 'disabled',
        type: 'item',
      })
      expect(row).toMatchObject(NORMALIZED)
    })

    // DCItem::lastValueToJSON / DCTable::lastValueToJSON as of netxms 302b4c6670.
    it('reads rows as a server with names-only last values sends them', () => {
      const threshold = { function: 'last', condition: 'greater', value: '90' }
      const item = adaptDciValue({
        id: 6,
        origin: 'agent',
        dataType: 'float',
        status: 'active',
        type: 'item',
        hasActiveThreshold: true,
        threshold: { ...threshold, currentSeverity: 'major' },
      })
      expect(item).toMatchObject({ sourceType: 1, origin: 'agent', dataType: 5, status: 0 })
      expect(item.threshold).toEqual({ ...threshold, currentSeverity: 3 })
      expect(item.isTable).toBe(false)

      const table = adaptDciValue({
        id: 7,
        origin: 'snmp',
        dataType: 'null',
        status: 'disabled',
        type: 'table',
        hasActiveThreshold: true,
        threshold: { condition: 'Usage > 90', currentSeverity: 'critical' },
      })
      expect(table).toMatchObject({ sourceType: 2, dataType: 6, status: 1, isTable: true })
      expect(table.threshold.currentSeverity).toBe(4)
    })

    it('keeps a coded threshold severity and leaves the response untouched', () => {
      const raw = { id: 6, hasActiveThreshold: true, threshold: { currentSeverity: 'minor' } }
      expect(adaptDciValue(raw).threshold.currentSeverity).toBe(2)
      expect(raw.threshold.currentSeverity).toBe('minor')
      const coded = { id: 6, hasActiveThreshold: true, threshold: { currentSeverity: 2 } }
      expect(adaptDciValue(coded).threshold.currentSeverity).toBe(2)
    })

    it('reads a name sent in sourceType', () => {
      expect(adaptDciValue({ id: 6, sourceType: 'snmp' })).toMatchObject({
        sourceType: 2,
        origin: 'snmp',
      })
    })

    it('reads the pre-rename "nxagent"', () => {
      expect(adaptDciValue({ id: 6, origin: 'nxagent' })).toMatchObject({
        sourceType: 1,
        origin: 'agent',
      })
    })

    it('adds no fields the server did not send', () => {
      expect(adaptDciValue({ id: 6 })).toEqual({ id: 6, isTable: false })
    })

    // The formatter treats anything but STRING/NULL codes as numeric, so a name reaching it
    // would scale strings and drop the fixed decimals of floats.
    it.each([
      ['float', 5, '12.500000', '%'],
      ['float', 5, '12.500000', ''],
      ['string', 4, '1000', ''],
      ['string', 4, '000123', ''],
    ])('formats a "%s" value like DCI_DT %i', (name, code, value, unitName) => {
      // flags 0x20000: multipliers off, so a float's raw six decimals would show
      for (const flags of [0, 0x20000]) {
        const named = adaptDciValue({ value, dataType: name, unitName, flags })
        const coded = adaptDciValue({ value, dataType: code, unitName, flags })
        expect(formatDciValue(named, '', 'en-US')).toBe(formatDciValue(coded, '', 'en-US'))
      }
    })
  })
})

describe('adaptDciCurrentValues', () => {
  it('marks table DCIs from the numeric type discriminator', () => {
    const adapted = adaptDciCurrentValues({
      objectId: 7,
      values: [
        { id: 1, description: 'CPU', type: 1 },
        { id: 2, description: 'Interfaces', type: 2 },
      ],
    })
    expect(adapted.values.map((v) => v.isTable)).toEqual([false, true])
    expect(adapted.objectId).toBe(7)
  })

  it('returns an empty list when values is missing or not an array', () => {
    expect(adaptDciCurrentValues({ objectId: 7 }).values).toEqual([])
    expect(adaptDciCurrentValues({ objectId: 7, values: null }).values).toEqual([])
  })

  it('passes a missing response through', () => {
    expect(adaptDciCurrentValues(null)).toBeNull()
  })
})

describe('adaptObject physical placement', () => {
  it('reads the physicalPlacement group when the server sends it', () => {
    const node = adaptObject({
      id: 27710,
      class: 'Node',
      name: 'sw-01',
      physicalPlacement: {
        containerId: 326,
        position: 36,
        height: 2,
        orientation: 1,
        imageFront: 'fd21a79f-e8d4-4c28-bf07-81b5fce4a26a',
        imageRear: '00000000-0000-0000-0000-000000000000',
        chassisPlacement: null,
      },
    })
    expect(node.physicalPlacement).toEqual({
      containerId: 326,
      position: 36,
      height: 2,
      orientation: 1,
      imageFront: 'fd21a79f-e8d4-4c28-bf07-81b5fce4a26a',
      imageRear: null,
      chassisPlacement: null,
    })
  })

  it('falls back to the flat keys on a server that predates the group', () => {
    // Reads must keep working against every older server; only writes need the new endpoint.
    const node = adaptObject({
      id: 27710,
      class: 'Node',
      name: 'sw-01',
      physicalContainerId: 326,
      rackPosition: 36,
      rackHeight: 2,
      rackOrientation: 2,
      rackImageFront: '00000000-0000-0000-0000-000000000000',
      rackImageRear: 'f3b356bb-17a8-4755-8c54-b04d5daf7f72',
    })
    expect(node.physicalPlacement).toMatchObject({
      containerId: 326,
      position: 36,
      height: 2,
      orientation: 2,
      imageFront: null,
      imageRear: 'f3b356bb-17a8-4755-8c54-b04d5daf7f72',
    })
  })

  it('reads a chassis placement from the flat chassisPlacementConfig too', () => {
    const node = adaptObject({
      id: 27710,
      class: 'Node',
      name: 'card-1',
      physicalContainerId: 500,
      chassisPlacementConfig: { width: 10, widthUnits: 0, orientation: 1 },
    })
    expect(node.physicalPlacement.chassisPlacement).toEqual({
      width: 10,
      widthUnits: 0,
      orientation: 1,
    })
  })

  it('reads a chassis own rack placement, which spells the container rackId', () => {
    const chassis = adaptObject({
      id: 500,
      class: 'Chassis',
      name: 'ch-1',
      rackId: 326,
      rackPosition: 4,
    })
    expect(chassis.physicalPlacement.containerId).toBe(326)
    expect(chassis.physicalPlacement.position).toBe(4)
  })

  it('reads a stored height of 0 as 1, the way the legacy spinner clamps it', () => {
    // The console writes rackHeight 0 for anything it places into a chassis, and displays it
    // as 1 (its spinner starts at 1). Sending the stored 0 back is a 400.
    const node = adaptObject({
      id: 27710,
      class: 'Node',
      name: 'card-1',
      physicalPlacement: {
        containerId: 500,
        position: 0,
        height: 0,
        orientation: 0,
        imageFront: null,
        imageRear: null,
        chassisPlacement: { width: 10, widthUnits: 0, orientation: 1 },
      },
    })
    expect(node.physicalPlacement.height).toBe(1)
  })

  it('clamps a stored height of 0 read from the flat keys too', () => {
    const node = adaptObject({
      id: 27710,
      class: 'Node',
      name: 'card-1',
      physicalContainerId: 500,
      rackHeight: 0,
    })
    expect(node.physicalPlacement.height).toBe(1)
  })

  it('reports an unplaced object as container 0, never undefined', () => {
    const node = adaptObject({ id: 27710, class: 'Node', name: 'sw-01' })
    expect(node.physicalPlacement).toEqual({
      containerId: 0,
      position: 0,
      height: 1,
      orientation: 0,
      imageFront: null,
      imageRear: null,
      chassisPlacement: null,
    })
  })
})

describe('objectToPhysicalPlacementPayload', () => {
  it('sends the whole group for a rack placement', () => {
    const payload = objectToPhysicalPlacementPayload({
      physicalPlacement: {
        containerId: 326,
        position: 36,
        height: 2,
        orientation: 1,
        imageFront: 'fd21a79f-e8d4-4c28-bf07-81b5fce4a26a',
        imageRear: null,
        chassisPlacement: null,
      },
    })
    expect(payload).toEqual({
      containerId: 326,
      position: 36,
      height: 2,
      orientation: 1,
      imageFront: 'fd21a79f-e8d4-4c28-bf07-81b5fce4a26a',
      imageRear: null,
    })
  })

  it('includes the chassis geometry when the object sits in a chassis', () => {
    const payload = objectToPhysicalPlacementPayload({
      physicalPlacement: {
        containerId: 500,
        position: 0,
        height: 1,
        orientation: 0,
        imageFront: null,
        imageRear: null,
        chassisPlacement: { width: 10, widthUnits: 0, orientation: 1 },
      },
    })
    expect(payload.containerId).toBe(500)
    expect(payload.chassisPlacement).toEqual({ width: 10, widthUnits: 0, orientation: 1 })
  })

  it('unplaces with containerId alone, so stale geometry cannot fail validation', () => {
    expect(
      objectToPhysicalPlacementPayload({ physicalPlacement: { containerId: 0, position: 99 } }),
    ).toEqual({ containerId: null })
  })

  it('unplaces when the draft has no placement at all', () => {
    expect(objectToPhysicalPlacementPayload({})).toEqual({ containerId: null })
  })
})

describe('adaptObject data center classes', () => {
  it('copies the property group of the class for editing', () => {
    const raw = {
      id: 2090000010,
      class: 'PowerDomain',
      name: 'UPS-A',
      powerDomain: { domainType: 'UPS', feedTag: 'A', ratedPower: 300000 },
    }
    const domain = adaptObject(raw)
    expect(domain.powerDomain).toEqual({
      domainType: raw.powerDomain.domainType,
      feedTag: raw.powerDomain.feedTag,
      ratedPower: raw.powerDomain.ratedPower,
    })
    expect(domain.powerDomain).not.toBe(raw.powerDomain)
  })

  it('reads a rack cabinet under the server names', () => {
    const rack = adaptObject({ id: 1, class: 'Rack', height: 47, width: 800, depth: 1200 })
    expect([rack.height, rack.width, rack.depth]).toEqual([47, 800, 1200])
  })
})
