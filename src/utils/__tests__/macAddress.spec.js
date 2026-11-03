import { describe, it, expect } from 'vitest'
import { parseMacQuery, isMacRefinementOf } from '@/utils/macAddress'

describe('parseMacQuery', () => {
  describe('full addresses', () => {
    it.each([
      ['00:1A:2B:3C:4D:5E', 'colon separated'],
      ['00-1a-2b-3c-4d-5e', 'hyphen separated, lower case'],
      ['001a.2b3c.4d5e', 'Cisco dotted'],
      ['001A2B3C4D5E', 'bare hex'],
    ])('detects %s (%s)', (input) => {
      const result = parseMacQuery(input)
      expect(result.isMac).toBe(true)
      expect(result.normalized).toBe('00:1A:2B:3C:4D:5E')
      expect(result.hexDigits).toBe(12)
      expect(result.isPartial).toBe(false)
    })

    it('ignores surrounding whitespace', () => {
      expect(parseMacQuery('  00:1A:2B:3C:4D:5E  ').normalized).toBe('00:1A:2B:3C:4D:5E')
    })
  })

  describe('prefixes', () => {
    it('detects a separated OUI prefix', () => {
      const result = parseMacQuery('00:1A:2B')
      expect(result.isMac).toBe(true)
      expect(result.normalized).toBe('00:1A:2B')
      expect(result.isPartial).toBe(true)
    })

    it('refuses a separated fragment shorter than an OUI', () => {
      expect(parseMacQuery('00:1A').isMac).toBe(false)
    })

    it('keeps an odd trailing digit rather than dropping it', () => {
      expect(parseMacQuery('00:1A:2B:3').normalized).toBe('00:1A:2B:3')
    })

    // The palette keys its MAC mode and fetched hits off this, so a flicker is visible.
    describe('a just-typed trailing separator', () => {
      it.each([
        ['00:1A:2B:', '00:1A:2B'],
        ['00-1a-2b-', '00:1A:2B'],
        ['001a.2b3c.', '00:1A:2B:3C'],
        ['00:1A:2B:3C:4D:5E:', '00:1A:2B:3C:4D:5E'],
      ])('keeps %s as %s', (input, normalized) => {
        const result = parseMacQuery(input)
        expect(result.isMac).toBe(true)
        expect(result.normalized).toBe(normalized)
      })

      it('forgives only one, and only at the end', () => {
        expect(parseMacQuery('00:1A:2B::').isMac).toBe(false)
        expect(parseMacQuery('00::2B:3C:4D:5E').isMac).toBe(false)
        expect(parseMacQuery(':').isMac).toBe(false)
      })
    })

    it('accepts a partial Cisco doublet in the trailing group only', () => {
      expect(parseMacQuery('001a.2b').isMac).toBe(true)
      // A short group anywhere but last is not a notation, it is something else entirely.
      expect(parseMacQuery('1a.2b3c.4d5e').isMac).toBe(false)
    })
  })

  describe('notation shape', () => {
    // Group widths are checked per notation: counting hex digits would accept 192.168.1.1.
    it.each(['192.168.1.1', '10.0.0.1', '1.2.3.4'])('rejects the IP address %s', (input) => {
      expect(parseMacQuery(input).isMac).toBe(false)
    })

    it('rejects mixed separators', () => {
      expect(parseMacQuery('00:1a-2b:3c').isMac).toBe(false)
    })

    it('rejects an empty group', () => {
      expect(parseMacQuery('00::2B:3C:4D:5E').isMac).toBe(false)
    })

    it('rejects an over-wide group', () => {
      expect(parseMacQuery('001A:2B:3C:4D:5E').isMac).toBe(false)
    })
  })

  describe('bare hex needs a full address', () => {
    // Ordinary words are frequently valid hex, so bare input below 12 digits is refused.
    it.each(['decade', 'facade', 'deadbeef', 'cafe', 'abc123'])('does not detect %s', (input) => {
      expect(parseMacQuery(input).isMac).toBe(false)
    })
  })

  describe('mac: override', () => {
    it('forces detection for a short bare fragment', () => {
      const result = parseMacQuery('mac:001a')
      expect(result.isMac).toBe(true)
      expect(result.forced).toBe(true)
      expect(result.normalized).toBe('00:1A')
    })

    it('is case insensitive and tolerates a space after the prefix', () => {
      expect(parseMacQuery('MAC: 00:1A').isMac).toBe(true)
    })

    it('reports forced even when the remainder is not hex', () => {
      const result = parseMacQuery('mac:zzz')
      expect(result.isMac).toBe(false)
      expect(result.forced).toBe(true)
    })

    it('does not detect the bare prefix with nothing after it', () => {
      expect(parseMacQuery('mac:').isMac).toBe(false)
    })
  })

  describe('rejects non-addresses', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'whitespace only'],
      ['core-switch-01', 'an object name'],
      ['00:1A:2B:3C:4D:5E:6F', 'too many octets'],
      ['00:1G:2B:3C:4D:5E', 'a non-hex digit'],
      ['192.168.1.1', 'an IP address'],
    ])('rejects %s (%s)', (input) => {
      expect(parseMacQuery(input).isMac).toBe(false)
    })

    it('survives null and undefined', () => {
      expect(parseMacQuery(null).isMac).toBe(false)
      expect(parseMacQuery(undefined).isMac).toBe(false)
    })
  })

  it('is stable across repeated calls', () => {
    // The separator regex is global; a leaked lastIndex would make results alternate.
    for (let i = 0; i < 3; i++) {
      expect(parseMacQuery('00:1A:2B:3C:4D:5E').isMac).toBe(true)
    }
  })
})

describe('isMacRefinementOf', () => {
  const searched = '00:50:56'

  describe('still the same lookup', () => {
    it.each([
      ['00:50:56', 'unchanged'],
      ['00:50:5', 'a digit deleted'],
      ['00:5', 'most of it deleted'],
      ['00:50:56:', 'reaching for the next octet'],
      ['00:50:56:A5', 'extended toward a full address'],
      ['00:50:56:A5:F7:08', 'completed to a full address'],
      ['005056', 'retyped bare'],
      ['00-50-56', 'retyped with hyphens'],
      ['0050.56', 'retyped Cisco style'],
      ['00:50:56  ', 'trailing whitespace'],
      ['mac:00:50:56', 'the mac: override added'],
      ['00:50:56'.toLowerCase(), 'lower case'],
    ])('keeps %s (%s)', (text) => {
      expect(isMacRefinementOf(text, searched)).toBe(true)
    })

    it('does not require the searched address to clear the length thresholds', () => {
      // '00:5' is under MIN_SEPARATED_HEX_DIGITS: refinement is a prefix test, not detection.
      expect(parseMacQuery('00:5').isMac).toBe(false)
      expect(isMacRefinementOf('00:5', searched)).toBe(true)
    })
  })

  describe('a different search', () => {
    it.each([
      ['00:50:57', 'a digit changed'],
      ['00:51:56', 'a middle digit changed'],
      ['10:50:56', 'a leading digit changed'],
      ['router', 'an object name'],
      ['core-switch-01', 'a hyphenated object name'],
      ['192.168.1.1', 'an IP address'],
      ['', 'cleared'],
      ['   ', 'whitespace only'],
    ])('drops %s (%s)', (text) => {
      expect(isMacRefinementOf(text, searched)).toBe(false)
    })

    it('survives null and undefined on either side', () => {
      expect(isMacRefinementOf(null, searched)).toBe(false)
      expect(isMacRefinementOf(undefined, searched)).toBe(false)
      expect(isMacRefinementOf('00:50:56', null)).toBe(false)
      expect(isMacRefinementOf('00:50:56', '')).toBe(false)
    })
  })
})
