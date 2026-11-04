import { describe, it, expect } from 'vitest'
import {
  SEARCH_MODE,
  SEARCH_ATTRIBUTES,
  CLASS_CONSTANTS,
  STANDARD_FIELDS,
  nxslString,
  compileObjectFilter,
  isEmptyFilter,
} from '../objectQueryScript'

describe('nxslString', () => {
  it('quotes a plain value', () => {
    expect(nxslString('core-sw')).toBe('"core-sw"')
  })

  it('escapes backslashes before quotes, so a regex survives the round trip', () => {
    // The user typed \d+"x. NXSL's lexer turns \\ back into \ and \" back into ", so the
    // regex engine sees exactly what was typed.
    expect(nxslString('\\d+"x')).toBe('"\\\\d+\\"x"')
  })

  it('encodes characters NXSL cannot carry raw inside a string', () => {
    // A raw newline in an NXSL string literal is a lexer error, not just ugly.
    expect(nxslString('a\nb\rc\td')).toBe('"a\\nb\\rc\\td"')
  })

  it('treats null and undefined as an empty string', () => {
    expect(nxslString(null)).toBe('""')
    expect(nxslString(undefined)).toBe('""')
  })
})

describe('compileObjectFilter — search modes', () => {
  it('matches a normal search as a case-insensitive substring', () => {
    const { script } = compileObjectFilter({ text: 'sw', mode: SEARCH_MODE.NORMAL })
    expect(script).toContain('index(lower(name), lower("sw")) > 0')
  })

  it('treats * and ? in a normal search literally', () => {
    const { script } = compileObjectFilter({ text: 'a*b?', mode: SEARCH_MODE.NORMAL })
    expect(script).toContain('index(lower(name), lower("a*b?")) > 0')
    expect(script).not.toContain('ilike')
  })

  it('passes a pattern search through unwrapped', () => {
    const { script } = compileObjectFilter({ text: 'core-*', mode: SEARCH_MODE.PATTERN })
    expect(script).toContain('name ilike "core-*"')
    expect(script).not.toContain('"*core-*"')
  })

  it('uses imatch for a regular expression', () => {
    const { script } = compileObjectFilter({ text: '^core\\d+$', mode: SEARCH_MODE.REGEXP })
    expect(script).toContain('name imatch "^core\\\\d+$"')
    expect(script).not.toContain('ilike')
  })

  it('escapes the search string rather than letting it reach the script as syntax', () => {
    const { script } = compileObjectFilter({ text: '" || true || "', mode: SEARCH_MODE.NORMAL })
    expect(script).toContain('lower("\\" || true || \\"")')
  })

  it('searches base attributes bare and class-specific ones through safe dereference', () => {
    const { script } = compileObjectFilter({ text: 'x', mode: SEARCH_MODE.PATTERN })
    expect(script).toContain('name ilike')
    expect(script).toContain('alias ilike')
    expect(script).toContain('comments ilike')
    // primaryHostName exists only on Node; a bare reference would abort the whole query on
    // every container it walked past.
    expect(script).toContain('$object?.primaryHostName) ilike')
    expect(script).toContain('$object?.macAddr) ilike')
  })

  it('casts every safe dereference to string, because ilike rejects NULL', () => {
    // `?.` yields NULL on a class without the attribute, and NXSL's ILIKE is not one of the
    // NULL-tolerant opcodes (libnxsl/vm.cpp) - it raises "Invalid operation with NULL value"
    // and kills the whole query on the first non-Node object.
    const { script } = compileObjectFilter({ text: 'x', mode: SEARCH_MODE.PATTERN })
    for (const attr of SEARCH_ATTRIBUTES.optional) {
      expect(script).toContain(`string($object?.${attr}) ilike`)
    }
    expect(script).not.toMatch(/\$object\?\.\w+ ilike/)
  })

  it('casts safe dereferences in normal mode too, since lower rejects NULL as well', () => {
    const { script } = compileObjectFilter({ text: 'x' })
    for (const attr of SEARCH_ATTRIBUTES.optional) {
      expect(script).toContain(`lower(string($object?.${attr}))`)
    }
    expect(script).not.toMatch(/lower\(\$object\?\./)
  })

  it('casts safe dereferences in regexp mode too, since imatch rejects NULL as well', () => {
    const { script } = compileObjectFilter({ text: '^x$', mode: SEARCH_MODE.REGEXP })
    expect(script).toContain('string($object?.sysDescription) imatch')
    expect(script).not.toMatch(/\$object\?\.\w+ imatch/)
  })

  it('ignores a search string that is only whitespace', () => {
    expect(compileObjectFilter({ text: '   ' }).script).toBe('true')
  })
})

describe('compileObjectFilter — class filter', () => {
  it('maps class names to the NXSL constants the server registers', () => {
    const { script } = compileObjectFilter({ classes: ['Node', 'Interface'] })
    expect(script).toBe('(type == NODE\n   || type == INTERFACE)')
  })

  it('emits a bare comparison for a single class', () => {
    expect(compileObjectFilter({ classes: ['Node'] }).script).toBe('type == NODE')
  })

  it('drops class names that have no NXSL constant', () => {
    expect(compileObjectFilter({ classes: ['Circuit'] }).script).toBe('true')
  })

  it('offers only classes the server can actually match', () => {
    expect(CLASS_CONSTANTS.Circuit).toBeUndefined()
    expect(CLASS_CONSTANTS.Node).toBe('NODE')
  })
})

describe('compileObjectFilter — zone filter', () => {
  it('lets objects without a zone through, as the legacy filter does', () => {
    const { script } = compileObjectFilter({ zones: [0, 5] })
    expect(script).toBe(
      '($object?.zoneUIN == null\n   || $object?.zoneUIN == 0\n   || $object?.zoneUIN == 5)',
    )
  })

  it('omits the clause when no zone is selected', () => {
    expect(compileObjectFilter({ zones: [] }).script).toBe('true')
  })

  it('coerces zone UINs to numbers so they cannot inject script', () => {
    const { script } = compileObjectFilter({ zones: ['7'] })
    expect(script).toContain('$object?.zoneUIN == 7')
  })
})

describe('compileObjectFilter — IP range', () => {
  it('passes ipAddr straight to AddrInRange, because it is already a string', () => {
    // NXSL_NetObjClass::getAttr returns getPrimaryIpAddress().toString() for `ipAddr`, not an
    // InetAddress object - `ipAddr->address` raises "no such attribute" on every object.
    const { script } = compileObjectFilter({ ipFrom: '10.0.0.1', ipTo: '10.0.0.99' })
    expect(script).toBe('AddrInRange(ipAddr, "10.0.0.1", "10.0.0.99")')
  })

  it('needs both ends of the range', () => {
    expect(compileObjectFilter({ ipFrom: '10.0.0.1' }).script).toBe('true')
    expect(compileObjectFilter({ ipTo: '10.0.0.99' }).script).toBe('true')
  })
})

describe('compileObjectFilter — combination and fields', () => {
  it('ANDs every active clause in a stable order', () => {
    const { script } = compileObjectFilter({
      text: 'sw',
      mode: SEARCH_MODE.PATTERN,
      classes: ['Node'],
      zones: [0],
      ipFrom: '10.0.0.1',
      ipTo: '10.0.0.99',
    })
    const lines = script.split('\n&& ')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('type == NODE')
    expect(lines[1]).toContain('zoneUIN')
    expect(lines[2]).toContain('AddrInRange')
    expect(lines[3]).toContain('ilike "sw"')
  })

  it('compiles an empty form to true', () => {
    expect(compileObjectFilter().script).toBe('true')
    expect(isEmptyFilter()).toBe(true)
    expect(isEmptyFilter({ classes: ['Node'] })).toBe(false)
  })

  it('always requests zoneUIN so the Zone column needs no second round trip', () => {
    expect(compileObjectFilter().fields).toEqual(STANDARD_FIELDS)
  })
})
