// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSelectionStore } from '@/stores/selectionStore'

let pinia

describe('selectionStore primaryContext', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    pinia._e.stop()
  })

  it('never carries the tree range selection into the header context', () => {
    const store = useSelectionStore()
    store.selectPrimary({ id: 1, name: 'server-01', class: 'Node' })
    store.setPrimarySelection([
      { id: 1, name: 'server-01', class: 'Node' },
      { id: 2, name: 'server-02', class: 'Node' },
    ])

    expect(store.primaryContext.object.id).toBe(1)
    expect(store.primaryContext.selection).toBeUndefined()
    expect(store.primaryObjects).toHaveLength(2)
  })
})
