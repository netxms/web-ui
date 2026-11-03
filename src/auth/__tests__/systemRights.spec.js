import { describe, it, expect } from 'vitest'
import {
  SYSTEM_RIGHTS,
  SYSTEM_RIGHTS_CATEGORIES,
  SYSTEM_RIGHT_LABELS,
  CAN_KEY_TO_RIGHT,
  labelForRight,
} from '../systemRights'

describe('labelForRight', () => {
  it('resolves a can key to the label the legacy client uses', () => {
    expect(labelForRight('manageActions')).toBe('Configure server actions')
    expect(labelForRight('manageUsers')).toBe('Manage users')
  })

  it('returns null for an unknown key rather than leaking the identifier', () => {
    // Callers fall back to generic copy; printing "manageWidgets" at a user helps nobody.
    expect(labelForRight('noSuchRight')).toBeNull()
    expect(labelForRight('')).toBeNull()
  })
})

describe('rights catalogue', () => {
  it('gives every can key a label', () => {
    // The gating UI names the missing right for every gate, so no key may be label-less.
    const unlabelled = Object.keys(CAN_KEY_TO_RIGHT).filter((key) => !labelForRight(key))
    expect(unlabelled).toEqual([])
  })

  it('labels every right the server defines', () => {
    // Bits 8, 36 and 37 are retired (DELETE_ALARMS, MANAGE_REPOSITORIES, VIEW_REPOSITORIES)
    // and deliberately absent from SYSTEM_RIGHTS.
    const unlabelled = Object.entries(SYSTEM_RIGHTS)
      .filter(([, bit]) => !SYSTEM_RIGHT_LABELS[bit])
      .map(([name, bit]) => `${name} (bit ${bit})`)
    expect(unlabelled).toEqual([])
  })

  it('lists each bit exactly once across the categories', () => {
    const bits = SYSTEM_RIGHTS_CATEGORIES.flatMap((c) => c.rights.map((r) => r.bit))
    expect(bits.length).toBe(new Set(bits).size)
  })

  it('maps can keys onto the bit positions the server uses', () => {
    expect(CAN_KEY_TO_RIGHT.manageUsers).toBe(SYSTEM_RIGHTS.MANAGE_USERS)
    // Bit 58 exceeds Number precision in a mask, which is why callers use BigInt.
    expect(CAN_KEY_TO_RIGHT.manageAiOperators).toBe(58)
  })
})
