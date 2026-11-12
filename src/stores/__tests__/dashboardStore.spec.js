// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDashboardStore } from '@/stores/dashboardStore'

describe('dashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with null selectedDashboardId', () => {
    const store = useDashboardStore()
    expect(store.selectedDashboardId).toBeNull()
  })

  it('starts with isEditMode = false', () => {
    expect(useDashboardStore().isEditMode).toBe(false)
  })

  it('starts with dirtyLayout = null', () => {
    expect(useDashboardStore().dirtyLayout).toBeNull()
  })

  describe('selectDashboard', () => {
    it('sets selectedDashboardId', () => {
      const store = useDashboardStore()
      store.selectDashboard(42)
      expect(store.selectedDashboardId).toBe(42)
    })

    it('clears isEditMode', () => {
      const store = useDashboardStore()
      store.isEditMode = true
      store.selectDashboard(1)
      expect(store.isEditMode).toBe(false)
    })

    it('clears dirtyLayout', () => {
      const store = useDashboardStore()
      store.dirtyLayout = [{ id: 'w1' }]
      store.selectDashboard(1)
      expect(store.dirtyLayout).toBeNull()
    })

    it('can select a different dashboard', () => {
      const store = useDashboardStore()
      store.selectDashboard(1)
      store.selectDashboard(99)
      expect(store.selectedDashboardId).toBe(99)
    })
  })

  describe('enterEditMode', () => {
    it('sets isEditMode to true', () => {
      const store = useDashboardStore()
      store.enterEditMode([])
      expect(store.isEditMode).toBe(true)
    })

    it('sets dirtyLayout to a copy of provided widgets', () => {
      const store = useDashboardStore()
      const widgets = [{ id: 'w1', x: 0, y: 0, w: 2, h: 2 }]
      store.enterEditMode(widgets)
      expect(store.dirtyLayout).toHaveLength(1)
      expect(store.dirtyLayout[0]).toMatchObject({ id: 'w1' })
    })

    it('creates a shallow copy (not the same array reference)', () => {
      const store = useDashboardStore()
      const widgets = [{ id: 'w1' }]
      store.enterEditMode(widgets)
      expect(store.dirtyLayout).not.toBe(widgets)
    })

    it('dirtyLayout items are copies of widget objects', () => {
      const store = useDashboardStore()
      const widgets = [{ id: 'w1', x: 0 }]
      store.enterEditMode(widgets)
      widgets[0].x = 99
      expect(store.dirtyLayout[0].x).toBe(0) // not affected by original mutation
    })
  })

  describe('discardChanges', () => {
    it('sets isEditMode to false', () => {
      const store = useDashboardStore()
      store.enterEditMode([])
      store.discardChanges()
      expect(store.isEditMode).toBe(false)
    })

    it('sets dirtyLayout to null', () => {
      const store = useDashboardStore()
      store.enterEditMode([{ id: 'w1' }])
      store.discardChanges()
      expect(store.dirtyLayout).toBeNull()
    })
  })

  describe('updateLayout', () => {
    it('replaces dirtyLayout with provided widgets', () => {
      const store = useDashboardStore()
      store.enterEditMode([{ id: 'w1' }])
      const updated = [{ id: 'w1', x: 5, y: 5, w: 3, h: 3 }]
      store.updateLayout(updated)
      expect(store.dirtyLayout).toStrictEqual(updated)
    })

    it('can set dirtyLayout without prior enterEditMode', () => {
      const store = useDashboardStore()
      store.updateLayout([{ id: 'x' }])
      expect(store.dirtyLayout).toHaveLength(1)
    })
  })

  describe('commitSave', () => {
    it('sets isEditMode to false', () => {
      const store = useDashboardStore()
      store.enterEditMode([])
      store.commitSave()
      expect(store.isEditMode).toBe(false)
    })

    it('sets dirtyLayout to null', () => {
      const store = useDashboardStore()
      store.enterEditMode([{ id: 'w1' }])
      store.commitSave()
      expect(store.dirtyLayout).toBeNull()
    })
  })

  describe('full edit workflow', () => {
    it('follows the enter → update → commit lifecycle', () => {
      const store = useDashboardStore()
      store.selectDashboard(7)
      expect(store.isEditMode).toBe(false)

      store.enterEditMode([{ id: 'w1', x: 0 }])
      expect(store.isEditMode).toBe(true)
      expect(store.dirtyLayout).toHaveLength(1)

      store.updateLayout([{ id: 'w1', x: 3, y: 2, w: 4, h: 4 }])
      expect(store.dirtyLayout[0].x).toBe(3)

      store.commitSave()
      expect(store.isEditMode).toBe(false)
      expect(store.dirtyLayout).toBeNull()
      expect(store.selectedDashboardId).toBe(7)
    })

    it('discard restores to pre-edit state', () => {
      const store = useDashboardStore()
      store.selectDashboard(7)
      store.enterEditMode([{ id: 'w1' }])
      store.updateLayout([{ id: 'w1', x: 99 }])
      store.discardChanges()
      expect(store.isEditMode).toBe(false)
      expect(store.dirtyLayout).toBeNull()
    })
  })
})
