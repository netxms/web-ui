// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computed, ref } from 'vue'

const objectRef = ref(undefined)
const isLoadingRef = ref(false)
const registryItems = ref([])
let lastActionContext = null

vi.mock('@/queries/useObjectQueries', () => ({
  useObject: () => ({ data: objectRef, isLoading: isLoadingRef }),
}))

vi.mock('@/composables/useActions', () => ({
  useActions: (contextRef) => {
    lastActionContext = contextRef
    return { menuItems: computed(() => registryItems.value) }
  },
}))

const { useObjectActionMenu } = await import('@/composables/useObjectActionMenu')

function labels(items) {
  return items.map((item) => (item.separator ? '---' : item.label))
}

describe('useObjectActionMenu', () => {
  beforeEach(() => {
    objectRef.value = undefined
    isLoadingRef.value = false
    registryItems.value = []
    lastActionContext = null
  })

  it('resolves the registry against the fetched object and the given view context', () => {
    const menu = useObjectActionMenu('rack')
    menu.objectId.value = 42
    objectRef.value = { id: 42, name: 'core-sw-01', class: 'Node' }

    expect(lastActionContext.value).toEqual({
      object: { id: 42, name: 'core-sw-01', class: 'Node' },
      viewContext: 'rack',
    })
  })

  it('puts the name header first and the surface items around the object actions', () => {
    const menu = useObjectActionMenu('rack')
    menu.objectId.value = 42
    objectRef.value = { id: 42, class: 'Node' }
    registryItems.value = [{ label: 'Open' }, { label: 'Properties...' }]

    const items = menu.buildItems({
      label: 'core-sw-01',
      before: [{ label: 'Go to object' }],
      after: [{ label: 'Remove from rack' }],
    })

    expect(labels(items)).toEqual([
      'core-sw-01',
      '---',
      'Go to object',
      '---',
      'Open',
      'Properties...',
      '---',
      'Remove from rack',
    ])
    expect(items[0].disabled).toBe(true)
  })

  it('shows a placeholder instead of an empty menu while the object loads', () => {
    const menu = useObjectActionMenu('rack')
    menu.objectId.value = 42
    isLoadingRef.value = true

    expect(labels(menu.buildItems({ label: 'core-sw-01' }))).toEqual([
      'core-sw-01',
      '---',
      'Loading...',
    ])
  })

  it('omits the object actions entirely for a target with no object behind it', () => {
    const menu = useObjectActionMenu('rack')
    registryItems.value = [{ label: 'Open' }]

    const items = menu.buildItems({
      label: 'PatchPanel',
      after: [{ label: 'Remove from rack' }],
    })

    expect(labels(items)).toEqual(['PatchPanel', '---', 'Remove from rack'])
  })
})
