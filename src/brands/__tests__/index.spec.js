// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { brand, isVendorMarkEnabled, VENDOR_MARK_ENABLED } from '@/brands'

describe('active brand', () => {
  it('is NetXMS under test (vitest.config.js pins it)', () => {
    expect(brand.id).toBe('netxms')
  })

  it('never shows the NetXMS mark on the NetXMS brand itself', () => {
    expect(VENDOR_MARK_ENABLED).toBe(false)
  })
})

describe('isVendorMarkEnabled', () => {
  // Client builds are white label: an unset or mistyped setting must not credit NetXMS.
  it('is on for a brand that carries the mark only when the setting says "true"', () => {
    expect(isVendorMarkEnabled({ vendorMark: true }, 'true')).toBe(true)
    expect(isVendorMarkEnabled({ vendorMark: true }, undefined)).toBe(false)
    expect(isVendorMarkEnabled({ vendorMark: true }, '')).toBe(false)
    expect(isVendorMarkEnabled({ vendorMark: true }, 'false')).toBe(false)
    expect(isVendorMarkEnabled({ vendorMark: true }, 'yes')).toBe(false)
  })

  it('is off for a brand without the mark, whatever the setting', () => {
    expect(isVendorMarkEnabled({ vendorMark: false }, 'true')).toBe(false)
  })
})
