import { describe, it, expect, beforeEach } from 'vitest'
import {
  isDemoDashboardId,
  listDemoDashboards,
  getDemoDashboard,
  saveDemoDashboard,
  createDemoDashboard,
  deleteDemoDashboard,
  resetDemoDashboardCache,
  DEMO_GROUP_ID,
} from '@/api/demoDashboardStorage'

const STORAGE_KEY = 'netxms-demo-dashboards'

beforeEach(() => {
  localStorage.clear()
  resetDemoDashboardCache()
})

describe('demoDashboardStorage', () => {
  it('seeds the shipped dashboards on first use', () => {
    const list = listDemoDashboards()
    expect(list.map((d) => d.id)).toEqual([700, 701, 702, 703])
    expect(list[0]).toMatchObject({ class: 'Dashboard', status: 0 })
  })

  it('identifies demo dashboards by store membership, not id range', () => {
    expect(isDemoDashboardId(700)).toBe(true)
    expect(isDemoDashboardId('703')).toBe(true)
    expect(isDemoDashboardId(699)).toBe(false)
    // Real server dashboards with ids above 700 must NOT be treated as demo
    expect(isDemoDashboardId(704)).toBe(false)
    expect(isDemoDashboardId(12345)).toBe(false)
    expect(isDemoDashboardId(DEMO_GROUP_ID)).toBe(false)
    const created = createDemoDashboard('Mine')
    expect(isDemoDashboardId(created.id)).toBe(true)
  })

  it('returns stored dashboards in API element shape', () => {
    const d = getDemoDashboard(700)
    expect(d.numColumns).toBeGreaterThan(0)
    expect(Array.isArray(d.elements)).toBe(true)
    expect(d.elements[0]).toHaveProperty('type')
    expect(d.elements[0]).toHaveProperty('data')
    expect(d.elements[0]).toHaveProperty('layout')
  })

  it('persists saves across a cache reset (localStorage round trip)', () => {
    saveDemoDashboard(700, { name: 'Renamed', elements: [] })
    resetDemoDashboardCache()
    const d = getDemoDashboard(700)
    expect(d.name).toBe('Renamed')
    expect(d.elements).toEqual([])
  })

  it('merge-saves partial updates, preserving missing fields', () => {
    const before = getDemoDashboard(701)
    saveDemoDashboard(701, { numColumns: 6 })
    const after = getDemoDashboard(701)
    expect(after.numColumns).toBe(6)
    expect(after.name).toBe(before.name)
    expect(after.elements).toEqual(before.elements)
  })

  it('creates new dashboards with incrementing ids from the high collision-free base', () => {
    const a = createDemoDashboard('My Board')
    const b = createDemoDashboard('Another')
    expect(a.id).toBe(2100000000)
    expect(b.id).toBe(2100000001)
    expect(listDemoDashboards().map((d) => d.id)).toContain(b.id)
    expect(getDemoDashboard(a.id)).toMatchObject({ name: 'My Board', elements: [] })
  })

  it('deletes dashboards', () => {
    const created = createDemoDashboard('Doomed')
    expect(deleteDemoDashboard(created.id)).toBe(true)
    expect(getDemoDashboard(created.id)).toBeNull()
    expect(deleteDemoDashboard(created.id)).toBe(false)
  })

  it('reseeds shipped dashboards on version bump, preserving user-created ones', () => {
    const created = createDemoDashboard('Keep Me')
    saveDemoDashboard(700, { name: 'User Edit' })

    // Simulate an old store version on disk
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY))
    state.version = 0
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    resetDemoDashboardCache()

    expect(getDemoDashboard(700).name).toBe('NOC Overview') // reseeded
    expect(getDemoDashboard(created.id)).toMatchObject({ name: 'Keep Me' }) // preserved
  })

  it('recovers from corrupted storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    resetDemoDashboardCache()
    expect(listDemoDashboards().map((d) => d.id)).toEqual([700, 701, 702, 703])
  })
})
