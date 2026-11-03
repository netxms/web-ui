<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTileUrl } from '@/composables/useTileUrl'
import { useTheme } from '@/composables/useTheme'

const props = defineProps({
  /** @type {{ geoJson: object, bounds: object } | null} */
  area: { type: Object, default: null },
})

const { tileUrl } = useTileUrl()
const { isDark } = useTheme()

const containerRef = ref(null)

let map = null
let tileLayerInstance = null
let areaLayer = null
let resizeObserver = null

const AREA_STYLE = {
  color: '#3b82f6',
  weight: 2,
  opacity: 0.85,
  fillOpacity: 0.12,
  fillColor: '#3b82f6',
}

onMounted(() => {
  map = L.map(containerRef.value, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
    center: [30, 10],
    zoom: 2,
  })

  map.attributionControl.setPrefix('')
  tileLayerInstance = L.tileLayer(tileUrl.value, {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(containerRef.value)

  renderArea(props.area)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})

function renderArea(area) {
  if (!map) return
  areaLayer?.remove()
  areaLayer = null
  if (!area?.geoJson) return
  areaLayer = L.geoJSON(area.geoJson, { style: () => AREA_STYLE }).addTo(map)
  if (area.bounds) {
    const { north, south, east, west } = area.bounds
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [24, 24], maxZoom: 14, animate: false },
    )
  }
}

watch(() => props.area, renderArea)

watch(tileUrl, (url) => {
  if (!map) return
  tileLayerInstance?.remove()
  tileLayerInstance = L.tileLayer(url, {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)
})
</script>

<template>
  <div class="geo-area-map-preview" :class="{ 'geo-area-map-preview--dark': isDark }">
    <div ref="containerRef" class="map-container" />
    <div v-if="!area" class="empty-state">
      <i class="pi pi-map" />
      <span>Hover an area to preview</span>
    </div>
  </div>
</template>

<style scoped>
.geo-area-map-preview {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--p-surface-ground);
  border-radius: var(--p-border-radius);
  overflow: hidden;
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

:deep(.leaflet-control-attribution) {
  font-size: 0.5625rem;
  opacity: 0.6;
  background: var(--p-surface-card);
  color: var(--p-text-muted-color);
}

.geo-area-map-preview--dark :deep(.leaflet-tile) {
  filter: brightness(0.7) contrast(1.1) saturate(0.9);
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  pointer-events: none;
}

.empty-state .pi {
  font-size: 1.5rem;
  opacity: 0.4;
}
</style>
