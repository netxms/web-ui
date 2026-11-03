import { describe, it, expect } from 'vitest'
import { validateBrand } from '../../validateBrand'
import netxms from '../index'

describe('netxms brand', () => {
  it('is a valid manifest', () => {
    expect(() => validateBrand(netxms)).not.toThrow()
  })

  it('keeps the console as it was before brands existed', () => {
    expect(netxms.productName).toBe('NetXMS')
    expect(netxms.defaultTheme).toBe('flame')
    expect(Object.keys(netxms.themes)).toEqual(['emerald', 'flame', 'crimson', 'ocean', 'blue'])
    expect(netxms.login.logo).toBeNull()
    expect(netxms.header.divider).toBe(false)
    expect(netxms.whatsNew).toBe(true)
    expect(netxms.vendorMark).toBe(false)
  })

  it('marks the dark-header themes', () => {
    const dark = Object.values(netxms.themes)
      .filter((theme) => theme.headerTone === 'dark')
      .map((theme) => theme.id)
    expect(dark).toEqual(['flame', 'crimson', 'ocean'])
  })
})
