import { describe, it, expect } from 'vitest'
import {
  GROUP_FLAG,
  EVERYONE_GROUP_ID,
  isGroupId,
  OBJECT_ACCESS_RIGHTS,
  OBJECT_ACCESS,
  OBJECT_RIGHT_API_NAMES,
  FULL_ACCESS_MASK,
  hasAccessBit,
  hasObjectRight,
  setAccessBit,
  summarizeAccess,
} from '../objectAccessRights'

describe('isGroupId', () => {
  it('detects group ids by the group flag bit', () => {
    expect(isGroupId(GROUP_FLAG)).toBe(true)
    expect(isGroupId(EVERYONE_GROUP_ID)).toBe(true)
    expect(isGroupId(0x40000001)).toBe(true)
    expect(isGroupId(5)).toBe(false)
    expect(isGroupId(0)).toBe(false)
  })
})

describe('OBJECT_ACCESS_RIGHTS', () => {
  it('defines 32 unique single-bit masks', () => {
    expect(OBJECT_ACCESS_RIGHTS).toHaveLength(32)
    const masks = OBJECT_ACCESS_RIGHTS.map((r) => r.mask)
    expect(new Set(masks).size).toBe(32)
    for (const mask of masks) {
      // single bit set
      expect(BigInt(mask) & (BigInt(mask) - 1n)).toBe(0n)
      expect(mask).toBeGreaterThan(0)
    }
  })

  it('covers all 32 low bits, including OBJECT_ACCESS_EXECUTE_SCRIPT', () => {
    expect(FULL_ACCESS_MASK).toBe(0xffffffff)
    expect(OBJECT_ACCESS_RIGHTS.some((r) => r.mask === 0x80000000)).toBe(true)
  })

  it('names every right with a unique key', () => {
    const keys = OBJECT_ACCESS_RIGHTS.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[A-Z][A-Z_]*$/)
  })

  it('derives OBJECT_ACCESS from the table', () => {
    expect(Object.keys(OBJECT_ACCESS)).toHaveLength(OBJECT_ACCESS_RIGHTS.length)
    expect(OBJECT_ACCESS.READ).toBe(0x00000001)
    expect(OBJECT_ACCESS.DELETE).toBe(0x00000008)
    expect(OBJECT_ACCESS.EXECUTE_SCRIPT).toBe(0x80000000)
  })

  it('FULL_ACCESS_MASK is the OR of all masks', () => {
    const or = Number(OBJECT_ACCESS_RIGHTS.reduce((acc, r) => acc | BigInt(r.mask), 0n))
    expect(FULL_ACCESS_MASK).toBe(or)
  })
})

describe('bit helpers', () => {
  it('sets and clears bits independently', () => {
    let access = 0
    access = setAccessBit(access, 0x1, true)
    access = setAccessBit(access, 0x2, true)
    expect(hasAccessBit(access, 0x1)).toBe(true)
    expect(hasAccessBit(access, 0x2)).toBe(true)
    access = setAccessBit(access, 0x1, false)
    expect(hasAccessBit(access, 0x1)).toBe(false)
    expect(hasAccessBit(access, 0x2)).toBe(true)
  })

  // Bit 31 is the sign bit for JS 32-bit bitwise ops: `x | 0x80000000` yields a
  // negative Number, which the server rejects as an access mask.
  it('handles bit 31 without signed-32-bit wraparound', () => {
    const access = setAccessBit(0x2, 0x80000000, true)
    expect(access).toBe(0x80000002)
    expect(hasAccessBit(access, 0x80000000)).toBe(true)
    expect(hasAccessBit(access, 0x2)).toBe(true)
    expect(hasAccessBit(access, 0x1)).toBe(false)

    const cleared = setAccessBit(access, 0x80000000, false)
    expect(cleared).toBe(0x2)
    expect(hasAccessBit(cleared, 0x80000000)).toBe(false)
  })

  it('never produces a negative mask', () => {
    let access = 0
    for (const right of OBJECT_ACCESS_RIGHTS) {
      access = setAccessBit(access, right.mask, true)
      expect(access).toBeGreaterThan(0)
    }
    expect(access).toBe(FULL_ACCESS_MASK)
  })
})

describe('summarizeAccess', () => {
  it('describes empty, single, multiple and full masks', () => {
    expect(summarizeAccess(0)).toBe('No rights')
    expect(summarizeAccess(0x1)).toBe('Read')
    expect(summarizeAccess(0x1 | 0x2 | 0x4 | 0x8 | 0x10)).toBe('Read +4')
    expect(summarizeAccess(FULL_ACCESS_MASK)).toBe('Full access')
    expect(summarizeAccess(0x80000000)).toBe('Execute scripts')
  })
})

describe('hasObjectRight', () => {
  const rights = (...keys) =>
    Object.fromEntries(OBJECT_ACCESS_RIGHTS.map((r) => [r.api, keys.includes(r.key)]))

  const NO_RIGHTS = rights()

  // A missing document means the server did not answer, not that the answer was "no rights".
  it('allows everything when the object carries no rights', () => {
    expect(hasObjectRight({ id: 1 }, 'DELETE')).toBe(true)
    expect(hasObjectRight({ id: 1, effectiveRights: null }, 'DELETE')).toBe(true)
    expect(hasObjectRight(null, 'DELETE')).toBe(true)
    expect(hasObjectRight(undefined, 'DELETE')).toBe(true)
  })

  it('denies everything when every right is false', () => {
    expect(hasObjectRight({ effectiveRights: NO_RIGHTS }, 'READ')).toBe(false)
    expect(hasObjectRight({ effectiveRights: NO_RIGHTS }, 'DELETE')).toBe(false)
  })

  it('answers per right', () => {
    const object = { effectiveRights: rights('READ', 'DELETE') }
    expect(hasObjectRight(object, 'READ')).toBe(true)
    expect(hasObjectRight(object, 'DELETE')).toBe(true)
    expect(hasObjectRight(object, 'MODIFY')).toBe(false)
  })

  it('allows a right the document does not mention at all', () => {
    // A server that predates one right still answers for the others; only an explicit
    // false hides anything.
    expect(hasObjectRight({ effectiveRights: { read: true } }, 'EXECUTE_SCRIPT')).toBe(true)
    expect(hasObjectRight({ effectiveRights: { read: true } }, 'READ')).toBe(true)
  })

  it('throws on an unknown right rather than silently allowing it', () => {
    expect(() => hasObjectRight({ effectiveRights: NO_RIGHTS }, 'NOT_A_RIGHT')).toThrow()
    expect(() => hasObjectRight(null, 'NOT_A_RIGHT')).toThrow()
  })
})

describe('OBJECT_RIGHT_API_NAMES', () => {
  it('maps every right to a distinct effectiveRights attribute name', () => {
    const names = Object.values(OBJECT_RIGHT_API_NAMES)
    expect(names).toHaveLength(OBJECT_ACCESS_RIGHTS.length)
    expect(new Set(names).size).toBe(names.length)
    expect(OBJECT_RIGHT_API_NAMES.EXECUTE_SCRIPT).toBe('executeScript')
    expect(OBJECT_RIGHT_API_NAMES.MAINTENANCE).toBe('controlMaintenanceMode')
    expect(OBJECT_RIGHT_API_NAMES.CREATE).toBe('createChildObjects')
  })
})
