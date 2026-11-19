import { describe, expect, it } from 'vitest'
import {
  DCI_GROUP_MODES,
  SOURCE_GROUP_MODES,
  dciGroupObjectIds,
  dciGroupOf,
  needsDciConfig,
} from '@/utils/dciGrouping'
import { getDciSourceTypeLabel } from '@/utils/objectUtils'

const OWNER = 100
const PROTO = { id: 7, description: 'Interface traffic', templateId: 900, templateItemId: 3 }
const ctx = {
  ownerId: OWNER,
  prototype: (id) => (id === 7 ? PROTO : null),
  objectName: (id) => ({ 900: 'Linux template', 55: 'eth0' })[id] ?? null,
}

describe('DCI_GROUP_MODES', () => {
  it('offers the legacy modes in the legacy order', () => {
    expect(DCI_GROUP_MODES.map((m) => m.value)).toEqual([
      'none',
      'tag',
      'origin',
      'status',
      'template',
      'instanceDiscovery',
      'relatedObject',
    ])
    expect([...SOURCE_GROUP_MODES]).toEqual(['template', 'instanceDiscovery', 'relatedObject'])
  })

  it('needs the DCI configuration for template and instance discovery only', () => {
    expect(DCI_GROUP_MODES.filter((m) => needsDciConfig(m.value)).map((m) => m.value)).toEqual([
      'template',
      'instanceDiscovery',
    ])
  })
})

describe('dciGroupOf', () => {
  it('tag: the tag, or (untagged) last', () => {
    expect(dciGroupOf({ userTag: 'disk' }, 'tag', ctx)).toEqual({
      key: 'tag:disk',
      label: 'disk',
      last: false,
      objectId: null,
    })
    expect(dciGroupOf({ userTag: '' }, 'tag', ctx)).toMatchObject({
      key: 'tag',
      label: '(untagged)',
      last: true,
    })
    expect(dciGroupOf({}, 'tag', ctx).key).toBe('tag')
  })

  it('origin reads both row shapes', () => {
    expect(dciGroupOf({ sourceType: 1, origin: 'agent' }, 'origin', ctx).label).toBe(
      getDciSourceTypeLabel(1),
    )
    expect(dciGroupOf({ origin: 'agent' }, 'origin', ctx).key).toBe(
      dciGroupOf({ sourceType: 1 }, 'origin', ctx).key,
    )
  })

  it('status reads both row shapes', () => {
    expect(dciGroupOf({ status: 'disabled' }, 'status', ctx)).toEqual(
      dciGroupOf({ status: 1 }, 'status', ctx),
    )
    expect(dciGroupOf({ status: 1 }, 'status', ctx)).toMatchObject({
      label: 'Disabled',
      last: false,
    })
  })

  it('template: the template object, through the prototype for instance DCIs', () => {
    expect(dciGroupOf({ templateId: 900, templateItemId: 3 }, 'template', ctx)).toEqual({
      key: 'template:900',
      label: 'Linux template',
      last: false,
      objectId: 900,
    })
    expect(dciGroupOf({ templateId: OWNER, templateItemId: 7 }, 'template', ctx).objectId).toBe(900)
    expect(dciGroupOf({ templateId: OWNER, templateItemId: 8 }, 'template', ctx)).toMatchObject({
      key: 'template',
      label: '(no template)',
      last: true,
    })
    expect(dciGroupOf({ templateId: 0 }, 'template', ctx).label).toBe('(no template)')
    expect(dciGroupOf({ templateId: 901, templateItemId: 1 }, 'template', ctx).label).toBe('[901]')
  })

  it('template: a prototype made on this object has no template', () => {
    const local = { ...ctx, prototype: () => ({ id: 7, description: 'x', templateId: 0 }) }
    expect(dciGroupOf({ templateId: OWNER, templateItemId: 7 }, 'template', local).label).toBe(
      '(no template)',
    )
  })

  it('instance discovery: named after the prototype', () => {
    expect(
      dciGroupOf({ templateId: OWNER, templateItemId: 7 }, 'instanceDiscovery', ctx),
    ).toMatchObject({ key: 'instanceDiscovery:7', label: 'Interface traffic', last: false })
    expect(
      dciGroupOf({ templateId: OWNER, templateItemId: 8 }, 'instanceDiscovery', ctx).label,
    ).toBe('[8]')
    expect(
      dciGroupOf({ templateId: 900, templateItemId: 3 }, 'instanceDiscovery', ctx),
    ).toMatchObject({ key: 'instanceDiscovery', label: '(no instance discovery)', last: true })
  })

  it('instance discovery: a prototype without a description goes by its metric', () => {
    const named = {
      ...ctx,
      prototype: () => ({ id: 7, description: '', name: 'If.Bytes({instance})' }),
    }
    expect(
      dciGroupOf({ templateId: OWNER, templateItemId: 7 }, 'instanceDiscovery', named).label,
    ).toBe('If.Bytes({instance})')
  })

  it('related object: the object, or (no related object)', () => {
    expect(dciGroupOf({ relatedObject: 55 }, 'relatedObject', ctx)).toEqual({
      key: 'relatedObject:55',
      label: 'eth0',
      last: false,
      objectId: 55,
    })
    expect(dciGroupOf({ relatedObject: 56 }, 'relatedObject', ctx).label).toBe('[56]')
    expect(dciGroupOf({ relatedObject: 0 }, 'relatedObject', ctx)).toMatchObject({
      key: 'relatedObject',
      label: '(no related object)',
      last: true,
    })
  })

  it('rejects an unknown mode', () => {
    expect(() => dciGroupOf({}, 'none', ctx)).toThrow()
    expect(() => dciGroupOf({}, 'bogus', ctx)).toThrow()
  })
})

describe('dciGroupObjectIds', () => {
  it('lists the objects whose names the groups need, once each', () => {
    const rows = [
      { templateId: 900, templateItemId: 3 },
      { templateId: OWNER, templateItemId: 7 },
      { relatedObject: 55 },
      { relatedObject: 55 },
    ]
    expect(dciGroupObjectIds(rows, 'template', ctx)).toEqual([900])
    expect(dciGroupObjectIds(rows, 'relatedObject', ctx)).toEqual([55])
    expect(dciGroupObjectIds(rows, 'tag', ctx)).toEqual([])
    expect(dciGroupObjectIds(rows, 'none', ctx)).toEqual([])
  })
})
