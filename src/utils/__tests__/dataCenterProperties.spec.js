// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  adaptPropertyGroup,
  createFormDefaults,
  createPayloadFields,
  propertyGroupPatch,
  rackCabinetPatch,
} from '../dataCenterProperties'

const domain = (powerDomain) => ({ id: 1, class: 'PowerDomain', powerDomain })

describe('propertyGroupPatch', () => {
  it('sends only the fields that changed, under the group key of the class', () => {
    const orig = domain({ domainType: 'UPS', feedTag: 'A', ratedPower: 300000 })
    const draft = domain({ domainType: 'UPS', feedTag: 'A', ratedPower: 320000 })
    expect(propertyGroupPatch(draft, orig)).toEqual({
      group: 'powerDomain',
      payload: { ratedPower: 320000 },
    })
  })

  it('trims text, and sends cleared text as null', () => {
    const orig = domain({ domainType: 'PDU', feedTag: 'A', ratedPower: 0 })
    expect(propertyGroupPatch(domain({ ...orig.powerDomain, feedTag: ' B ' }), orig)).toEqual({
      group: 'powerDomain',
      payload: { feedTag: 'B' },
    })
    expect(propertyGroupPatch(domain({ ...orig.powerDomain, feedTag: '  ' }), orig)).toEqual({
      group: 'powerDomain',
      payload: { feedTag: null },
    })
  })

  it('answers null when nothing changed or the class has no group', () => {
    const orig = domain({ domainType: 'PDU', feedTag: 'A', ratedPower: 0 })
    expect(propertyGroupPatch(domain({ ...orig.powerDomain, feedTag: 'A ' }), orig)).toBeNull()
    expect(propertyGroupPatch({ id: 2, class: 'Container' }, { id: 2, class: 'Container' })).toBe(
      null,
    )
  })

  it('leaves the derived room area out of the patch', () => {
    const room = adaptPropertyGroup('Room', { roomType: 'COMPUTER_ROOM', area: 112.5 })
    const orig = { class: 'Room', room }
    const draft = { class: 'Room', room: { ...room, gridTileSize: 600, area: 1 } }
    expect(propertyGroupPatch(draft, orig)).toEqual({
      group: 'room',
      payload: { gridTileSize: 600 },
    })
  })
})

describe('adaptPropertyGroup', () => {
  it('reads a null GUID background as no background', () => {
    const room = adaptPropertyGroup('Room', {
      backgroundImage: '00000000-0000-0000-0000-000000000000',
    })
    expect(room.backgroundImage).toBeNull()
  })

  it('defaults a missing provider to empty text', () => {
    expect(adaptPropertyGroup('Facility', { settlementLag: 3 })).toEqual({
      settlementLag: 3,
      providerId: '',
    })
  })
})

describe('rackCabinetPatch', () => {
  it('carries changed width and depth of a rack only', () => {
    const orig = { class: 'Rack', width: 600, depth: 1200 }
    expect(rackCabinetPatch({ ...orig, width: 800 }, orig)).toEqual({ width: 800 })
    expect(rackCabinetPatch(orig, orig)).toEqual({})
    expect(rackCabinetPatch({ class: 'Node', width: 1 }, { class: 'Node' })).toEqual({})
  })
})

describe('createPayloadFields', () => {
  it('starts from the legacy dialog defaults; a room leaves its size to the server', () => {
    expect(createPayloadFields('Room', createFormDefaults('Room'))).toEqual({
      roomType: 'COMPUTER_ROOM',
    })
    expect(createPayloadFields('Facility', createFormDefaults('Facility'))).toEqual({
      settlementLag: 5,
    })
  })

  it('leaves out empty text and trims the rest', () => {
    expect(
      createPayloadFields('PowerDomain', { domainType: 'PDU', feedTag: ' A ', ratedPower: 22000 }),
    ).toEqual({ domainType: 'PDU', feedTag: 'A', ratedPower: 22000 })
    expect(
      createPayloadFields('PowerDomain', { domainType: 'UPS', feedTag: '', ratedPower: 0 }),
    ).toEqual({ domainType: 'UPS', ratedPower: 0 })
  })
})
