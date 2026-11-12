// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DCI_SYSTEM_TAGS,
  DCI_SYSTEM_TAG_GROUPS,
  isKnownSystemTag,
  joinSystemTag,
  systemTagBase,
  systemTagQualifier,
} from '../dciSystemTags'

describe('DCI system tag vocabulary', () => {
  it('uses the dotted form the server switched to in schema 70.26', () => {
    for (const { tag } of DCI_SYSTEM_TAGS) expect(tag).not.toMatch(/^iface-/)
    expect(isKnownSystemTag('iface.inbound.bits')).toBe(true)
    // The pre-70.26 form is not offered: writing it over the WebAPI stores it unconverted.
    expect(isKnownSystemTag('iface-inbound-bits')).toBe(false)
  })

  it('matches the legacy vocabulary (netxms 3ec1c9281b)', () => {
    expect(DCI_SYSTEM_TAGS).toHaveLength(35)
    expect(new Set(DCI_SYSTEM_TAGS.map((entry) => entry.tag)).size).toBe(35)
    for (const tag of ['eed.edc_bg', 'eed.res_os', 'eed.win_fre', 'eed.reuse_upgrade']) {
      expect(isKnownSystemTag(tag)).toBe(true)
    }
    expect(isKnownSystemTag('eed.ren')).toBe(false)
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

  it('splits and joins a feed qualifier', () => {
    expect([systemTagBase('power.feed/A'), systemTagQualifier('power.feed/A')]).toEqual([
      'power.feed',
      'A',
    ])
    expect([systemTagBase('env.temp.inlet'), systemTagQualifier('env.temp.inlet')]).toEqual([
      'env.temp.inlet',
      '',
    ])
    expect(joinSystemTag('power.feed', ' B ')).toBe('power.feed/B')
    expect(joinSystemTag('power.feed', '  ')).toBe('power.feed')
    // Other clears the whole tag, qualifier included.
    expect(joinSystemTag('', 'A')).toBe('')
  })
})
