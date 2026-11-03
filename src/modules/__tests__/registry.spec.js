import { describe, it, expect, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'

// `vi.hoisted` because the mock factory runs before this module's own imports resolve.
const serverComponents = vi.hoisted(() => ({ state: null }))
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => serverComponents.state,
}))

import { createModuleRegistry, MODULE_STATE, useModuleRuntime } from '@/modules'

const view = (id) => ({
  group: 'monitoring',
  id,
  label: id,
  icon: 'pi pi-box',
  component: () => Promise.resolve({}),
})
const manifest = (id, extra = {}) => ({
  id,
  label: id,
  requiredComponent: id.toUpperCase(),
  objectViews: [],
  ...extra,
})

describe('createModuleRegistry', () => {
  it('reports a module this build does not contain as inactive', () => {
    const registry = createModuleRegistry([])
    registry.setServerComponents(['ALPHA'])
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.INACTIVE)
  })

  it('is unknown until the server has answered', () => {
    const registry = createModuleRegistry([manifest('alpha')])
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.UNKNOWN)
  })

  it('follows the server component list once it is known', () => {
    const registry = createModuleRegistry([manifest('alpha')])
    registry.setServerComponents(['CORE'])
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.INACTIVE)
    registry.setServerComponents(['CORE', 'ALPHA'])
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.ACTIVE)
    registry.setServerComponents(null)
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.UNKNOWN)
  })

  it('treats a forced module as active whatever the server says', () => {
    const registry = createModuleRegistry([manifest('alpha')], { forced: ['alpha'] })
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.ACTIVE)
    registry.setServerComponents([])
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.ACTIVE)
  })

  it('ignores forced ids the build does not contain', () => {
    const registry = createModuleRegistry([manifest('alpha')], { forced: ['beta'] })
    expect(registry.ignoredForced).toEqual(['beta'])
    expect(registry.getModuleState('beta')).toBe(MODULE_STATE.INACTIVE)
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.UNKNOWN)
  })

  it('re-evaluates computeds when the server answer lands', () => {
    const registry = createModuleRegistry([manifest('alpha')])
    const state = computed(() => registry.getModuleState('alpha'))
    expect(state.value).toBe(MODULE_STATE.UNKNOWN)
    registry.setServerComponents(['ALPHA'])
    expect(state.value).toBe(MODULE_STATE.ACTIVE)
  })

  it('tags each module view with its module id', () => {
    const registry = createModuleRegistry([manifest('alpha', { objectViews: [view('alphaView')] })])
    expect(registry.objectViews).toEqual([
      expect.objectContaining({ id: 'alphaView', moduleId: 'alpha' }),
    ])
  })

  it('rejects a duplicate module id', () => {
    expect(() => createModuleRegistry([manifest('alpha'), manifest('alpha')])).toThrow(
      /Duplicate module id "alpha"/,
    )
  })

  it('rejects a view id declared by two modules', () => {
    expect(() =>
      createModuleRegistry([
        manifest('alpha', { objectViews: [view('shared')] }),
        manifest('beta', { objectViews: [view('shared')] }),
      ]),
    ).toThrow(/"shared" is declared by more than one module/)
  })

  it('tags each overview card with its module id and rejects a duplicate id', () => {
    const card = { id: 'alphaCard', objectClasses: ['Container'], component: view('x').component }
    const registry = createModuleRegistry([manifest('alpha', { overviewCards: [card] })])
    expect(registry.overviewCards).toEqual([
      expect.objectContaining({ id: 'alphaCard', moduleId: 'alpha' }),
    ])
    expect(() =>
      createModuleRegistry([
        manifest('alpha', { overviewCards: [card] }),
        manifest('beta', { overviewCards: [card] }),
      ]),
    ).toThrow(/"alphaCard" is declared by more than one module/)
  })

  it('rejects a manifest without a required component', () => {
    expect(() => createModuleRegistry([{ id: 'alpha', objectViews: [] }])).toThrow(
      /requiredComponent/,
    )
  })
})

describe('useModuleRuntime', () => {
  function run(registry) {
    const scope = effectScope()
    scope.run(() => useModuleRuntime(registry))
    return scope
  }

  it('feeds the registry from server-info, unknown while loading', async () => {
    const components = ref([])
    const isLoading = ref(true)
    serverComponents.state = { components, isLoading }
    const registry = createModuleRegistry([manifest('alpha')])
    const scope = run(registry)
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.UNKNOWN)

    components.value = ['CORE', 'ALPHA']
    isLoading.value = false
    await nextTick()
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.ACTIVE)
    scope.stop()
  })

  it('settles to inactive when server-info fails or predates components', async () => {
    // useServerComponents reads a missing or failed response as [] once loading ends.
    const components = ref([])
    const isLoading = ref(true)
    serverComponents.state = { components, isLoading }
    const registry = createModuleRegistry([manifest('alpha')])
    const scope = run(registry)

    isLoading.value = false
    await nextTick()
    expect(registry.getModuleState('alpha')).toBe(MODULE_STATE.INACTIVE)
    scope.stop()
  })
})
