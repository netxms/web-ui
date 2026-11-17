import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { createBucket, userPrefs } from '@/utils/appStorage'

const mapViewBucket = createBucket('network-map-view', 'local')

const DEFAULT_VIEW_STATE = {
  hideLinks: false,
  hideLinkLabels: false,
  showGrid: false,
  snapToGrid: false,
  // Map Properties drawer width (px).
  propertiesWidth: 480,
  layersPanelOpen: false,
  /**
   * Per map id: `off: true` while overflow tables are switched off, and dragged table offsets
   * per canvas, `graph` (graph units) and `geo` (container pixels), each `{ [elementId]: { x, y } }`.
   * A map back at the defaults has no entry.
   */
  overflowTables: {},
}

/** Follow the account (`userPrefs`, `networkMap.<key>`), stored only while non-default. */
const ACCOUNT_TOGGLES = ['hideLinks', 'hideLinkLabels', 'showGrid', 'snapToGrid']

const toggleField = (key) => `networkMap.${key}`

function loadToggles() {
  const toggles = {}
  for (const key of ACCOUNT_TOGGLES) {
    const stored = userPrefs.get(toggleField(key))
    toggles[key] = typeof stored === 'boolean' ? stored : DEFAULT_VIEW_STATE[key]
  }
  return toggles
}

/** Per map id, the names of the layers this account hides. Never written to the map. */
const HIDDEN_LAYERS_FIELD = 'networkMap.hiddenLayers'
const NO_LAYERS = Object.freeze([])

function loadHiddenLayers() {
  const stored = userPrefs.get(HIDDEN_LAYERS_FIELD)
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
}

/** Kept apart: different units. */
const TABLE_CANVASES = new Set(['graph', 'geo'])

const NO_OFFSETS = Object.freeze({})

function loadViewState() {
  const local = mapViewBucket.read()
  for (const key of ACCOUNT_TOGGLES) delete local[key]
  const state = { ...DEFAULT_VIEW_STATE, ...local, ...loadToggles() }
  const tables = state.overflowTables
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) state.overflowTables = {}
  return state
}

export const useNetworkMapStore = defineStore('networkMap', () => {
  const selectedMapId = ref(null)

  const selectedElementId = ref(null)

  const hoveredElementId = ref(null)

  function selectMap(mapId) {
    selectedMapId.value = mapId
    selectedElementId.value = null
  }

  function selectElement(elementId) {
    selectedElementId.value = elementId
  }

  function hoverElement(elementId) {
    hoveredElementId.value = elementId
  }

  function clearHover() {
    hoveredElementId.value = null
  }

  const viewState = ref(loadViewState())

  watch(
    viewState,
    (state) => {
      const local = { ...state }
      for (const key of ACCOUNT_TOGGLES) {
        if (state[key] === DEFAULT_VIEW_STATE[key]) userPrefs.remove(toggleField(key))
        else userPrefs.set(toggleField(key), state[key])
        delete local[key]
      }
      mapViewBucket.write(local)
    },
    { deep: true },
  )

  const hiddenLayersByMap = ref(loadHiddenLayers())

  watch(userPrefs.revision, () => {
    Object.assign(viewState.value, loadToggles())
    hiddenLayersByMap.value = loadHiddenLayers()
  })

  /**
   * @param {number | string} mapId
   * @returns {string[]}
   */
  function hiddenLayers(mapId) {
    return hiddenLayersByMap.value[mapId] ?? NO_LAYERS
  }

  /** A map with every layer shown has no entry. */
  function setHiddenLayers(mapId, names) {
    if (mapId == null) return
    const all = { ...hiddenLayersByMap.value }
    const list = [...new Set(names)].filter((n) => typeof n === 'string' && n !== '').sort()
    if (list.length) all[mapId] = list
    else delete all[mapId]
    hiddenLayersByMap.value = all
    if (Object.keys(all).length) userPrefs.set(HIDDEN_LAYERS_FIELD, all)
    else userPrefs.remove(HIDDEN_LAYERS_FIELD)
  }

  /** An entry left empty is dropped. */
  function changeTableEntry(mapId, change) {
    if (mapId == null) return
    const all = { ...viewState.value.overflowTables }
    const entry = { ...all[mapId] }
    change(entry)
    if (Object.keys(entry).length) all[mapId] = entry
    else delete all[mapId]
    viewState.value.overflowTables = all
  }

  function overflowTablesEnabled(mapId) {
    return !viewState.value.overflowTables[mapId]?.off
  }

  function setOverflowTablesEnabled(mapId, enabled) {
    changeTableEntry(mapId, (entry) => {
      if (enabled) delete entry.off
      else entry.off = true
    })
  }

  /**
   * The same object until it changes, so a view can hand it to the canvas as is.
   * @param {number | string} mapId
   * @param {'graph' | 'geo'} canvas
   * @returns {Object<string, { x: number, y: number }>}
   */
  function overflowTableOffsets(mapId, canvas) {
    return viewState.value.overflowTables[mapId]?.[canvas] ?? NO_OFFSETS
  }

  function setOverflowTableOffsets(mapId, canvas, offsets) {
    if (!TABLE_CANVASES.has(canvas)) return
    changeTableEntry(mapId, (entry) => {
      const rounded = {}
      for (const [id, offset] of Object.entries(offsets ?? {})) {
        rounded[id] = { x: Math.round(offset.x), y: Math.round(offset.y) }
      }
      if (Object.keys(rounded).length) entry[canvas] = rounded
      else delete entry[canvas]
    })
  }

  return {
    selectedMapId,
    selectedElementId,
    hoveredElementId,
    viewState,
    selectMap,
    selectElement,
    hoverElement,
    clearHover,
    overflowTablesEnabled,
    setOverflowTablesEnabled,
    overflowTableOffsets,
    setOverflowTableOffsets,
    hiddenLayers,
    setHiddenLayers,
  }
})
