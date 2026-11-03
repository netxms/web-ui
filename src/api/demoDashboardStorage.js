/**
 * localStorage-backed store for demo dashboards, in the API element shape serializeDashboard()
 * produces so demo and real dashboards share one adapter path. A dashboard is "demo" only by
 * membership in this store, never by id range, so real server dashboards are never shadowed.
 * Bumping SEED_VERSION resets the seeded dashboards and keeps user-created ones.
 */
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'
import { DEMO_DASHBOARD_SEEDS as SEEDS } from './demoSeeds'

const STORAGE_KEY = 'netxms-demo-dashboards'
const SEED_VERSION = 4

/** Synthetic tree parent for demo dashboards. */
export const DEMO_GROUP_ID = -1

/** User-created demo dashboards allocate ids from here (object ids are uint32). */
const CREATED_ID_BASE = 2100000000

/** In-memory cache of the parsed store (kept in sync with localStorage). */
let cache = null

function freshState() {
  return {
    version: SEED_VERSION,
    dashboards: Object.fromEntries(
      Object.entries(SEEDS).map(([id, seed]) => [id, structuredClone(seed)]),
    ),
    nextId: CREATED_ID_BASE,
  }
}

function load() {
  if (cache) return cache
  let state
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    state = null
  }
  if (!state || typeof state !== 'object' || !state.dashboards) {
    state = freshState()
  } else if ((state.version ?? 0) < SEED_VERSION) {
    // Reseed shipped dashboards, keep user-created ones
    for (const [id, seed] of Object.entries(SEEDS)) {
      state.dashboards[id] = structuredClone(seed)
    }
    state.version = SEED_VERSION
    state.nextId = Math.max(state.nextId ?? 0, CREATED_ID_BASE)
  }
  cache = state
  persist()
  return cache
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota errors etc. — demo persistence silently degrades to in-memory
  }
}

export function isDemoDashboardId(id) {
  return DEMO_CONTENT_ENABLED && load().dashboards[Number(id)] != null
}

/** Tree children for the synthetic "Demo Dashboards" group. */
export function listDemoDashboards() {
  const state = load()
  return Object.values(state.dashboards)
    .sort((a, b) => a.id - b.id)
    .map((d) => ({ id: d.id, class: 'Dashboard', name: d.name, status: 0 }))
}

/**
 * @param {number} id
 * @returns {object|null} stored dashboard in API shape
 */
export function getDemoDashboard(id) {
  const state = load()
  return state.dashboards[Number(id)] ?? null
}

/**
 * Fields absent from `apiShape` keep their stored value.
 * @param {number} id
 * @param {object} apiShape
 * @returns {object} stored dashboard
 */
export function saveDemoDashboard(id, apiShape) {
  const state = load()
  const numId = Number(id)
  const existing = state.dashboards[numId]
  if (!existing) throw new Error(`Demo dashboard ${id} not found`)
  state.dashboards[numId] = { ...existing, ...apiShape, id: numId }
  persist()
  return state.dashboards[numId]
}

/**
 * @param {string} name
 * @returns {{id: number, name: string, class: string}}
 */
export function createDemoDashboard(name) {
  const state = load()
  const id = state.nextId++
  state.dashboards[id] = {
    id,
    name,
    numColumns: 12,
    rowHeight: 80,
    scrollable: false,
    elements: [],
  }
  persist()
  return { id, name, class: 'Dashboard' }
}

/**
 * @param {number} id
 * @returns {boolean} true when a dashboard was removed
 */
export function deleteDemoDashboard(id) {
  const state = load()
  const numId = Number(id)
  if (!state.dashboards[numId]) return false
  delete state.dashboards[numId]
  persist()
  return true
}

/** Test helper — drop the in-memory cache so the next call re-reads storage. */
export function resetDemoDashboardCache() {
  cache = null
}
