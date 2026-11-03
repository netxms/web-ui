import { describe, it, expect, vi, beforeEach } from 'vitest'

const FAKE_MODULE = vi.hoisted(() => ({
  id: 'fake',
  label: 'Fake module',
  requiredComponent: 'FAKE',
  overviewCards: [
    {
      id: 'fakeCard',
      objectClasses: ['Container', 'ServiceRoot'],
      component: () => Promise.resolve({}),
    },
  ],
}))

vi.mock('@/modules', async () => {
  const actual = await vi.importActual('@/modules')
  return { ...actual, moduleRegistry: actual.createModuleRegistry([FAKE_MODULE]) }
})

import { getOverviewCards, validateModuleOverviewCards } from '@/config/overviewCards'
import { moduleRegistry } from '@/modules'

beforeEach(() => moduleRegistry.setServerComponents(null))

describe('getOverviewCards', () => {
  it('lists a module card only while the module is active, for its classes', () => {
    expect(getOverviewCards('Container')).toEqual([])
    moduleRegistry.setServerComponents(['FAKE'])
    expect(getOverviewCards('Container').map((c) => c.id)).toEqual(['fakeCard'])
    expect(getOverviewCards('Collector')).toEqual([])
    moduleRegistry.setServerComponents(['CORE'])
    expect(getOverviewCards('Container')).toEqual([])
  })

  it('wraps the loader once, so re-renders reuse the component', () => {
    moduleRegistry.setServerComponents(['FAKE'])
    expect(getOverviewCards('Container')[0].view).toBe(getOverviewCards('ServiceRoot')[0].view)
  })
})

describe('validateModuleOverviewCards', () => {
  const card = (extra) => ({ id: 'c', moduleId: 'm', component: () => null, ...extra })

  it('rejects a card without a component or with classes the overview does not serve', () => {
    expect(() =>
      validateModuleOverviewCards([card({ component: null, objectClasses: ['Container'] })]),
    ).toThrow(/has no component/)
    expect(() => validateModuleOverviewCards([card({ objectClasses: ['Node'] })])).toThrow(
      /must name classes/,
    )
    expect(() => validateModuleOverviewCards([card({ objectClasses: [] })])).toThrow(
      /must name classes/,
    )
  })

  it('accepts a well-formed card', () => {
    expect(() =>
      validateModuleOverviewCards([card({ objectClasses: ['Collector'] })]),
    ).not.toThrow()
  })
})
