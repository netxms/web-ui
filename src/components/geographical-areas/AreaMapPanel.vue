<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-editable'
import { useTileUrl } from '@/composables/useTileUrl'
import { useTheme } from '@/composables/useTheme'

const props = defineProps({
  /** @type {{ id: string, geoJson: object, bounds: object }[]} */
  areas: { type: Array, default: () => [] },
  /** @type {string|null} */
  selectedId: { type: String, default: null },
  /** @type {'idle'|'drawing-polygon'|'drawing-rectangle'} */
  drawMode: { type: String, default: 'idle' },
  /** Preview during create, not yet saved */
  previewGeoJson: { type: Object, default: null },
  editMode: { type: Boolean, default: false },
  /** Working copy of the area being edited */
  editGeoJson: { type: Object, default: null },
})

const emit = defineEmits(['drawing-complete', 'update:editGeoJson'])

const { tileUrl } = useTileUrl()
const { isDark } = useTheme()

const containerRef = ref(null)

let map = null
let tileLayerInstance = null
let resizeObserver = null

/** @type {Map<string, L.GeoJSON>} by area.id */
const areaLayers = new Map()

let previewLayer = null
let drawingLayer = null
/** @type {L.Polygon|null} */
let editablePolygon = null
/** Set while a map drag updates editGeoJson, so the watcher does not re-update the polygon */
let _skipExternalGeoJsonUpdate = false
/** Kept to remove exactly this listener */
let _onVertexChange = null
let _onVertexRawClick = null
let _onVertexContextMenu = null

function areaStyle(areaId) {
  const isSelected = areaId === props.selectedId
  const primary =
    getComputedStyle(document.documentElement).getPropertyValue('--p-primary-color').trim() ||
    '#3b82f6'
  return {
    color: isSelected ? primary : '#6b7280',
    weight: isSelected ? 3 : 1.5,
    opacity: isSelected ? 0.9 : 0.6,
    fillOpacity: isSelected ? 0.15 : 0.07,
    fillColor: isSelected ? primary : '#6b7280',
  }
}

const PREVIEW_STYLE = {
  color: '#f59e0b',
  weight: 2,
  opacity: 0.9,
  fillOpacity: 0.12,
  fillColor: '#f59e0b',
  dashArray: '6 4',
}

const DRAWING_STYLE = {
  color: '#f59e0b',
  weight: 2,
  opacity: 0.8,
  fillOpacity: 0.08,
  fillColor: '#f59e0b',
  dashArray: '4 4',
}

onMounted(() => {
  map = L.map(containerRef.value, {
    zoomControl: false,
    center: [30, 10],
    zoom: 3,
    editable: true,
  })

  map.attributionControl.setPrefix('')
  tileLayerInstance = L.tileLayer(tileUrl.value, {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  L.control.zoom({ position: 'topright' }).addTo(map)

  map.on('click', onMapClick)
  document.addEventListener('keydown', onKeyDown)

  // Covers panel open/close, drag resize and window resize.
  resizeObserver = new ResizeObserver(() => map.invalidateSize())
  resizeObserver.observe(containerRef.value)

  syncAreaLayers()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  resizeObserver?.disconnect()
  exitEditMode()
  map?.remove()
  map = null
})

function syncAreaLayers() {
  if (!map) return
  const currentIds = new Set(props.areas.map((a) => a.id))

  for (const [id, layer] of areaLayers) {
    if (!currentIds.has(id)) {
      layer.remove()
      areaLayers.delete(id)
    }
  }

  for (const area of props.areas) {
    if (areaLayers.has(area.id)) {
      const layer = areaLayers.get(area.id)
      // Don't touch geometry while this area's editable polygon is active
      if (area.id !== props.selectedId || !props.editMode) {
        layer.clearLayers()
        layer.addData(area.geoJson)
      }
      layer.setStyle(areaStyle(area.id))
    } else {
      const layer = L.geoJSON(area.geoJson, {
        style: () => areaStyle(area.id),
      }).addTo(map)
      areaLayers.set(area.id, layer)
    }
  }
}

watch(tileUrl, (url) => {
  if (!map) return
  tileLayerInstance?.remove()
  tileLayerInstance = L.tileLayer(url, {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)
})

watch([() => props.areas, () => props.selectedId], () => {
  syncAreaLayers()
  if (props.selectedId && map) {
    const area = props.areas.find((a) => a.id === props.selectedId)
    if (area?.bounds) {
      const { north, south, east, west } = area.bounds
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [40, 40], maxZoom: 14, animate: true },
      )
    }
  }
})

watch(
  () => props.previewGeoJson,
  (geoJson) => {
    if (!map) return
    previewLayer?.remove()
    previewLayer = null
    if (!geoJson) return
    previewLayer = L.geoJSON(geoJson, { style: () => PREVIEW_STYLE }).addTo(map)
    const coords = geoJson.geometry?.coordinates?.[0]
    if (coords?.length) {
      const lats = coords.map((c) => c[1])
      const lngs = coords.map((c) => c[0])
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        { padding: [60, 60], maxZoom: 14, animate: true },
      )
    }
  },
)

const EDIT_STYLE = {
  color: 'var(--p-primary-color, #3b82f6)',
  weight: 2.5,
  opacity: 0.95,
  fillOpacity: 0.18,
  fillColor: 'var(--p-primary-color, #3b82f6)',
}

function geoJsonToLatLngs(geoJson) {
  // GeoJSON rings are [lng, lat]; drop the closing duplicate
  const ring = geoJson.geometry.coordinates[0]
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng])
}

function latLngsToGeoJson(latLngs) {
  const coords = latLngs.map((ll) => [ll.lng, ll.lat])
  coords.push(coords[0]) // close ring
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

function enterEditMode(geoJson) {
  if (!map || !geoJson) return
  if (props.selectedId) {
    areaLayers.get(props.selectedId)?.setStyle({ opacity: 0, fillOpacity: 0 })
  }

  const latLngs = geoJsonToLatLngs(geoJson)
  editablePolygon = L.polygon(latLngs, EDIT_STYLE).addTo(map)
  editablePolygon.enableEdit()

  _onVertexChange = function () {
    if (!editablePolygon) return
    const lls = editablePolygon.getLatLngs()[0]
    if (!lls || lls.length < 3) return
    _skipExternalGeoJsonUpdate = true
    emit('update:editGeoJson', latLngsToGeoJson(lls))
  }

  map.on('editable:vertex:dragend', _onVertexChange)
  map.on('editable:vertex:deleted', _onVertexChange)
  map.on('editable:vertex:new', _onVertexChange)

  // Right-click deletes a vertex instead of left-click
  _onVertexRawClick = (e) => {
    e.cancel()
  }
  map.on('editable:vertex:rawclick', _onVertexRawClick)

  // vertex.delete() already enforces MIN_VERTEX (3)
  _onVertexContextMenu = (e) => {
    e.vertex.delete()
  }
  map.on('editable:vertex:contextmenu', _onVertexContextMenu)
}

function exitEditMode() {
  if (!map) return

  if (_onVertexChange) {
    map.off('editable:vertex:dragend', _onVertexChange)
    map.off('editable:vertex:deleted', _onVertexChange)
    map.off('editable:vertex:new', _onVertexChange)
    _onVertexChange = null
  }
  if (_onVertexRawClick) {
    map.off('editable:vertex:rawclick', _onVertexRawClick)
    _onVertexRawClick = null
  }
  if (_onVertexContextMenu) {
    map.off('editable:vertex:contextmenu', _onVertexContextMenu)
    _onVertexContextMenu = null
  }

  editablePolygon?.disableEdit()
  editablePolygon?.remove()
  editablePolygon = null

  // Apply staged changes (editGeoJson still set) so the layer shows what was edited.
  const layer = areaLayers.get(props.selectedId)
  if (layer) {
    if (props.editGeoJson) {
      layer.clearLayers()
      layer.addData(props.editGeoJson)
    }
    layer.setStyle(areaStyle(props.selectedId))
  }
}

watch(
  () => props.editMode,
  (active) => {
    if (active) {
      enterEditMode(props.editGeoJson)
    } else {
      exitEditMode()
    }
  },
)

// Coord table edits reach the polygon here; map-originated ones are skipped. editor.reset(), not
// enableEdit(), refreshes the handles without a second editor. Cleared means discarded: revert.
watch(
  () => props.editGeoJson,
  (geoJson) => {
    if (_skipExternalGeoJsonUpdate) {
      _skipExternalGeoJsonUpdate = false
      return
    }
    if (!editablePolygon) {
      if (!geoJson && props.selectedId) {
        const area = props.areas.find((a) => a.id === props.selectedId)
        const layer = areaLayers.get(props.selectedId)
        if (layer && area) {
          layer.clearLayers()
          layer.addData(area.geoJson)
          layer.setStyle(areaStyle(props.selectedId))
        }
      }
      return
    }
    if (!geoJson) return
    editablePolygon.setLatLngs(geoJsonToLatLngs(geoJson))
    editablePolygon.editor.reset()
  },
)

const drawingPoints = ref([])

watch(
  () => props.drawMode,
  (mode) => {
    drawingPoints.value = []
    drawingLayer?.remove()
    drawingLayer = null
    if (!map) return
    map.getContainer().style.cursor = mode !== 'idle' ? 'crosshair' : ''
  },
)

watch(drawingPoints, (pts) => {
  if (!map) return
  drawingLayer?.remove()
  drawingLayer = null
  if (pts.length < 2) return
  const coordinates = [...pts, pts[0]].map(([lat, lng]) => [lng, lat])
  drawingLayer = L.geoJSON(
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } },
    { style: () => DRAWING_STYLE },
  ).addTo(map)
})

function onMapClick(event) {
  if (props.drawMode === 'idle') return
  const { lat, lng } = event.latlng

  if (props.drawMode === 'drawing-polygon') {
    const pts = drawingPoints.value
    if (pts.length >= 3) {
      const [firstLat, firstLng] = pts[0]
      const zoom = map.getZoom()
      const threshold = 0.5 / Math.pow(2, zoom - 5)
      if (Math.abs(lat - firstLat) < threshold && Math.abs(lng - firstLng) < threshold) {
        finishPolygon()
        return
      }
    }
    drawingPoints.value = [...pts, [lat, lng]]
  } else if (props.drawMode === 'drawing-rectangle') {
    const pts = drawingPoints.value
    if (pts.length === 0) {
      drawingPoints.value = [[lat, lng]]
    } else {
      const [lat1, lng1] = pts[0]
      finishRectangle(lat1, lng1, lat, lng)
    }
  }
}

function finishPolygon() {
  const pts = drawingPoints.value
  if (pts.length < 3) return
  const coordinates = [...pts, pts[0]].map(([lat, lng]) => [lng, lat])
  completeDrawing(coordinates)
}

function finishRectangle(lat1, lng1, lat2, lng2) {
  const minLat = Math.min(lat1, lat2)
  const maxLat = Math.max(lat1, lat2)
  const minLng = Math.min(lng1, lng2)
  const maxLng = Math.max(lng1, lng2)
  completeDrawing([
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ])
}

function completeDrawing(coordinates) {
  drawingPoints.value = []
  drawingLayer?.remove()
  drawingLayer = null
  emit('drawing-complete', {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  })
}

function onKeyDown(event) {
  if (props.drawMode === 'idle') return
  if (event.key === 'Escape') {
    drawingPoints.value = []
    drawingLayer?.remove()
    drawingLayer = null
    emit('drawing-complete', null) // null = cancelled
  } else if (event.key === 'Enter' && props.drawMode === 'drawing-polygon') {
    finishPolygon()
  }
}

const drawingPoints_ = drawingPoints
</script>

<template>
  <div class="area-map-panel" :class="{ 'area-map-panel--dark': isDark }">
    <div ref="containerRef" class="map-container" />

    <Transition name="draw-hint">
      <div v-if="editMode" class="draw-hint draw-hint--edit">
        Drag points · Click edge midpoints to add
        <span class="draw-hint-esc">Right-click point to remove</span>
      </div>
    </Transition>

    <Transition name="draw-hint">
      <div v-if="drawMode !== 'idle'" class="draw-hint">
        <template v-if="drawMode === 'drawing-polygon'">
          <template v-if="drawingPoints_.length === 0">Click to place first vertex</template>
          <template v-else-if="drawingPoints_.length < 3">
            {{ drawingPoints_.length }} point{{ drawingPoints_.length > 1 ? 's' : '' }} — keep
            clicking
          </template>
          <template v-else>
            {{ drawingPoints_.length }} points — click near first or press Enter to finish
          </template>
        </template>
        <template v-else-if="drawMode === 'drawing-rectangle'">
          <template v-if="drawingPoints_.length === 0">Click to set first corner</template>
          <template v-else>Click to set opposite corner</template>
        </template>
        <span class="draw-hint-esc">Esc to cancel</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.area-map-panel {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

:deep(.leaflet-container) {
  width: 100%;
  height: 100%;
  background: var(--p-surface-ground);
  font-family: inherit;
}

.area-map-panel--dark :deep(.leaflet-tile) {
  filter: brightness(0.7) contrast(1.1) saturate(0.9);
}

:deep(.leaflet-control-attribution) {
  font-size: 0.625rem;
  opacity: 0.7;
  background: var(--p-surface-card);
  color: var(--p-text-muted-color);
}

:deep(.leaflet-control-zoom a) {
  background: var(--p-surface-card);
  color: var(--p-text-color);
  border-color: var(--p-surface-border);
}

:deep(.leaflet-control-zoom a:hover) {
  background: var(--p-surface-hover);
}

.draw-hint {
  position: absolute;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 1rem;
  padding: 0.35rem 0.875rem;
  font-size: 0.75rem;
  color: var(--p-text-color);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.draw-hint-esc {
  color: var(--p-text-muted-color);
  font-size: 0.6875rem;
}

:deep(.leaflet-div-icon) {
  background: var(--p-primary-color, #3b82f6);
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

:deep(.leaflet-vertex-icon) {
  background: var(--p-primary-color, #3b82f6);
  border: 2px solid white;
  border-radius: 50%;
  width: 16px !important;
  height: 16px !important;
  margin-left: -8px !important;
  margin-top: -8px !important;
  cursor: grab;
}

:deep(.leaflet-middle-icon) {
  background: var(--p-primary-color, #3b82f6);
  border: 2px solid white;
  border-radius: 50%;
  opacity: 0.5;
  width: 12px !important;
  height: 12px !important;
  margin-left: -6px !important;
  margin-top: -6px !important;
  cursor: crosshair;
}

.draw-hint--edit {
  background: color-mix(in srgb, var(--p-primary-color, #3b82f6) 12%, var(--p-surface-card));
  border-color: color-mix(in srgb, var(--p-primary-color, #3b82f6) 30%, var(--p-surface-border));
}

.draw-hint-enter-active,
.draw-hint-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.draw-hint-enter-from,
.draw-hint-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
