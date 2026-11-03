import { describe, it, expect } from 'vitest'
import { DCI_SYSTEM_TAGS, DCI_SYSTEM_TAG_GROUPS, isKnownSystemTag } from '../dciSystemTags'

describe('DCI system tag vocabulary', () => {
  it('uses the dotted form the server switched to in schema 70.26', () => {
    for (const { tag } of DCI_SYSTEM_TAGS) expect(tag).not.toMatch(/^iface-/)
    expect(isKnownSystemTag('iface.inbound.bits')).toBe(true)
    // The pre-70.26 form is not offered: writing it over the WebAPI stores it unconverted.
    expect(isKnownSystemTag('iface-inbound-bits')).toBe(false)
  })

  it('matches the legacy vocabulary size', () => {
    expect(DCI_SYSTEM_TAGS).toHaveLength(32)
    expect(new Set(DCI_SYSTEM_TAGS.map((entry) => entry.tag)).size).toBe(32)
  })

  it('groups tags by first segment, in vocabulary order', () => {
    expect(DCI_SYSTEM_TAG_GROUPS.map((group) => group.pattern)).toEqual([
      'iface.*',
      'eed.*',
      'power.*',
      'cooling.*',
      'env.*',
      'water.*',
      'heat.*',
    ])
    const iface = DCI_SYSTEM_TAG_GROUPS.find((group) => group.prefix === 'iface')
    expect(iface.tags).toHaveLength(7)
  })
})
