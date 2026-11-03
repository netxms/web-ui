import { describe, it, expect, vi } from 'vitest'
import { setRouteTitle, setDetailTitle } from '@/utils/pageTitle'

vi.mock('@/brands', () => ({ brand: { productName: 'Acme Monitor' } }))

describe('page title', () => {
  it('ends with the brand product name, most specific part first', () => {
    setRouteTitle('Infrastructure')
    setDetailTitle('core-sw-01')
    expect(document.title).toBe('core-sw-01 - Infrastructure - Acme Monitor')
  })

  it('is the product name alone without a route title', () => {
    setRouteTitle(undefined)
    expect(document.title).toBe('Acme Monitor')
  })
})
