<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Tabs from 'primevue/tabs'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { useCreateGeographicalArea } from '@/queries/useGeographicalAreaQueries'
import FormField from '@/components/common/FormField.vue'

const emit = defineEmits([
  'cancel',
  'created',
  /** GeoJSON Feature or null; controls draw mode on the map */
  'draw-mode-change',
  /** Preview GeoJSON or null */
  'preview-change',
])

const toast = useToast()
const { mutate: createArea, isPending: isSaving } = useCreateGeographicalArea()

const activeTab = ref('draw')

watch(activeTab, (tab) => {
  if (tab !== 'draw') emit('draw-mode-change', 'idle')
  if (tab !== 'coordinates' && tab !== 'kml') emit('preview-change', null)
  if (tab === 'kml') emit('preview-change', activeGeoJson.value)
})

const name = ref('')
const comments = ref('')

const drawShape = ref('rectangle') // 'rectangle' | 'polygon'
const drawnGeoJson = ref(null)
const isDrawing = ref(false)

function startDraw() {
  drawnGeoJson.value = null
  isDrawing.value = true
  emit(
    'draw-mode-change',
    drawShape.value === 'rectangle' ? 'drawing-rectangle' : 'drawing-polygon',
  )
}

function cancelDraw() {
  isDrawing.value = false
  emit('draw-mode-change', 'idle')
}

/** Called by the parent when the map finishes drawing */
function onDrawingComplete(geoJson) {
  isDrawing.value = false
  emit('draw-mode-change', 'idle')
  if (geoJson) {
    drawnGeoJson.value = geoJson
    emit('preview-change', geoJson)
  }
}

const coordRows = ref([
  { id: 1, lat: null, lng: null },
  { id: 2, lat: null, lng: null },
  { id: 3, lat: null, lng: null },
])
let nextRowId = 4

function addCoordRow() {
  coordRows.value = [...coordRows.value, { id: nextRowId++, lat: null, lng: null }]
}

function removeCoordRow(id) {
  if (coordRows.value.length <= 3) return
  coordRows.value = coordRows.value.filter((r) => r.id !== id)
}

// A paste of two numbers ("56.87634, 23.93513" or space-separated) fills both lat and lng.
function handleCoordPaste(event, row) {
  const text = (event.clipboardData ?? window.clipboardData).getData('text').trim()
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return
  event.preventDefault()
  row.lat = parseFloat(match[1])
  row.lng = parseFloat(match[2])
}

const coordGeoJson = computed(() => {
  const validRows = coordRows.value.filter((r) => r.lat != null && r.lng != null)
  if (validRows.length < 3) return null
  const coords = validRows.map((r) => [r.lng, r.lat])
  coords.push(coords[0]) // close ring
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
})

watch(coordGeoJson, (geoJson) => {
  if (activeTab.value === 'coordinates') {
    emit('preview-change', geoJson)
  }
})

const kmlFile = ref(null)
/** @type {import('vue').Ref<Array<{ name: string|null, border: {latitude:number,longitude:number}[] }>>} */
const kmlPolygons = ref([])
const kmlError = ref(null)
const selectedKmlIndex = ref(null)

/** @returns {{ polygons, error }} outer-boundary polygons */
function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return { polygons: [], error: 'Invalid KML file — could not parse XML.' }
  }

  const polygons = []

  // Placemarks first, to capture names
  for (const placemark of doc.querySelectorAll('Placemark')) {
    const name = placemark.querySelector('name')?.textContent?.trim() || null
    for (const coordEl of placemark.querySelectorAll(
      'Polygon outerBoundaryIs LinearRing coordinates',
    )) {
      const border = parseKmlCoords(coordEl.textContent)
      if (border) polygons.push({ name, border })
    }
  }

  // Fallback: bare LinearRing elements outside Placemarks
  if (polygons.length === 0) {
    for (const coordEl of doc.querySelectorAll('LinearRing coordinates')) {
      const border = parseKmlCoords(coordEl.textContent)
      if (border) polygons.push({ name: null, border })
    }
  }

  if (polygons.length === 0) {
    const found = []
    if (doc.querySelector('Point')) found.push('Point')
    if (doc.querySelector('LineString')) found.push('LineString')
    if (doc.querySelector('MultiGeometry')) found.push('MultiGeometry')
    const detail = found.length
      ? ` Found: ${found.join(', ')}. Only Polygon geometries can be used as geo areas.`
      : ''
    return { polygons: [], error: `No polygon geometries found in this KML file.${detail}` }
  }
  return { polygons, error: null }
}

function parseKmlCoords(text) {
  const border = []
  for (const pt of text.trim().split(/\s+/)) {
    const parts = pt.split(',')
    const lng = parseFloat(parts[0])
    const lat = parseFloat(parts[1])
    if (!isNaN(lat) && !isNaN(lng)) border.push({ latitude: lat, longitude: lng })
  }
  const first = border[0]
  const last = border[border.length - 1]
  if (first && last && first.latitude === last.latitude && first.longitude === last.longitude) {
    border.pop()
  }
  return border.length >= 3 ? border : null
}

function onKmlFileChange(event) {
  const file = event.target.files[0] ?? null
  kmlFile.value = file
  kmlPolygons.value = []
  kmlError.value = null
  selectedKmlIndex.value = null

  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const { polygons, error } = parseKml(e.target.result)
    if (error) {
      kmlError.value = error
    } else {
      kmlPolygons.value = polygons
      if (polygons.length === 1) selectedKmlIndex.value = 0
    }
  }
  reader.readAsText(file)
}

function kmlPolygonToGeoJson(polygon) {
  const coords = polygon.border.map(({ latitude, longitude }) => [longitude, latitude])
  coords.push(coords[0]) // close ring
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}

const activeGeoJson = computed(() => {
  if (activeTab.value === 'draw') return drawnGeoJson.value
  if (activeTab.value === 'coordinates') return coordGeoJson.value
  if (activeTab.value === 'kml') {
    const idx = selectedKmlIndex.value
    if (idx == null) return null
    const poly = kmlPolygons.value[idx]
    return poly ? kmlPolygonToGeoJson(poly) : null
  }
  return null
})

watch(selectedKmlIndex, () => {
  if (activeTab.value === 'kml') emit('preview-change', activeGeoJson.value)
})

const canSave = computed(
  () => name.value.trim().length > 0 && activeGeoJson.value != null && !isSaving.value,
)

function save() {
  if (!canSave.value) return
  createArea(
    {
      name: name.value.trim(),
      comments: comments.value.trim(),
      geoJson: activeGeoJson.value,
    },
    {
      onSuccess: (area) => {
        toast.add({ severity: 'success', summary: 'Area created', life: 2500 })
        emit('preview-change', null)
        emit('created', area)
      },
      onError: () => toast.add({ severity: 'error', summary: 'Failed to create area', life: 3000 }),
    },
  )
}

function cancel() {
  emit('draw-mode-change', 'idle')
  emit('preview-change', null)
  emit('cancel')
}

defineExpose({ onDrawingComplete })
</script>

<template>
  <div class="area-create-panel">
    <div class="create-header">
      <div class="create-header-left">
        <Button
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="Cancel"
          @click="cancel"
        />
        <span class="create-title">New Geographical Area</span>
      </div>
      <div class="create-actions">
        <Button label="Cancel" severity="secondary" text size="small" @click="cancel" />
        <Button label="Save" size="small" :disabled="!canSave" :loading="isSaving" @click="save" />
      </div>
    </div>

    <div class="create-body">
      <div class="common-fields">
        <FormField class="field-row" label="Name" required v-slot="{ id }">
          <InputText
            :id="id"
            v-model="name"
            class="field-input"
            size="small"
            placeholder="e.g. European HQ Campus"
            autofocus
          />
        </FormField>
        <FormField class="field-row" label="Comments" v-slot="{ id }">
          <Textarea
            :id="id"
            v-model="comments"
            class="field-input"
            :auto-resize="false"
            rows="2"
            size="small"
            placeholder="Optional comments"
          />
        </FormField>
      </div>

      <Tabs v-model:value="activeTab" class="source-tabs">
        <TabList>
          <Tab value="draw">Draw on Map</Tab>
          <Tab value="coordinates">Coordinates</Tab>
          <Tab value="kml">Upload KML</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="draw">
            <div class="draw-tab-content">
              <template v-if="!drawnGeoJson && !isDrawing">
                <p class="draw-hint">
                  Select a shape, then click <strong>Start Drawing</strong> and define the area on
                  the map.
                </p>
                <div class="draw-controls-row">
                  <Button
                    label="Rectangle"
                    icon="pi pi-stop"
                    :severity="drawShape === 'rectangle' ? 'primary' : 'secondary'"
                    :outlined="drawShape !== 'rectangle'"
                    size="small"
                    @click="drawShape = 'rectangle'"
                  />
                  <Button
                    label="Polygon"
                    icon="pi pi-pencil"
                    :severity="drawShape === 'polygon' ? 'primary' : 'secondary'"
                    :outlined="drawShape !== 'polygon'"
                    size="small"
                    @click="drawShape = 'polygon'"
                  />
                  <span class="draw-controls-sep">›</span>
                  <Button
                    label="Start Drawing"
                    icon="pi pi-map-marker"
                    size="small"
                    @click="startDraw"
                  />
                </div>
              </template>

              <div v-else-if="isDrawing" class="draw-active">
                <p>Click on the map to draw. The hint at the bottom of the map will guide you.</p>
                <Button
                  label="Cancel Drawing"
                  severity="secondary"
                  size="small"
                  @click="cancelDraw"
                />
              </div>

              <div v-else class="draw-done">
                <i class="pi pi-check-circle done-icon" />
                <span>Area drawn successfully.</span>
                <Button
                  label="Redraw"
                  severity="secondary"
                  text
                  size="small"
                  icon="pi pi-refresh"
                  @click="startDraw"
                />
              </div>
            </div>
          </TabPanel>

          <TabPanel value="coordinates">
            <div class="coords-tab-content">
              <p class="coords-hint">
                Enter at least 3 coordinate pairs. The polygon closes automatically.
              </p>
              <DataTable :value="coordRows" size="small" class="coords-table" data-key="id">
                <Column header="#" style="width: 2.5rem">
                  <template #body="{ index }">
                    <span class="row-index">{{ index + 1 }}</span>
                  </template>
                </Column>
                <Column header="Latitude" style="width: 50%">
                  <template #body="{ data }">
                    <div @paste="(e) => handleCoordPaste(e, data)">
                      <InputNumber
                        v-model="data.lat"
                        :min="-90"
                        :max="90"
                        :max-fraction-digits="6"
                        size="small"
                        class="coord-input"
                        placeholder="e.g. 52.5200"
                      />
                    </div>
                  </template>
                </Column>
                <Column header="Longitude" style="width: 50%">
                  <template #body="{ data }">
                    <div @paste="(e) => handleCoordPaste(e, data)">
                      <InputNumber
                        v-model="data.lng"
                        :min="-180"
                        :max="180"
                        :max-fraction-digits="6"
                        size="small"
                        class="coord-input"
                        placeholder="e.g. 13.4050"
                      />
                    </div>
                  </template>
                </Column>
                <Column style="width: 2.5rem">
                  <template #body="{ data }">
                    <Button
                      icon="pi pi-times"
                      severity="secondary"
                      text
                      rounded
                      size="small"
                      :disabled="coordRows.length <= 3"
                      aria-label="Remove row"
                      @click="removeCoordRow(data.id)"
                    />
                  </template>
                </Column>
              </DataTable>
              <Button
                label="Add Point"
                icon="pi pi-plus"
                severity="secondary"
                text
                size="small"
                class="add-row-btn"
                @click="addCoordRow"
              />
            </div>
          </TabPanel>

          <TabPanel value="kml">
            <div class="kml-tab-content">
              <input
                ref="kmlInput"
                type="file"
                accept=".kml"
                class="kml-input-hidden"
                @change="onKmlFileChange"
              />
              <div class="kml-file-row">
                <template v-if="!kmlFile">
                  <Button
                    label="Browse KML file..."
                    icon="pi pi-upload"
                    severity="secondary"
                    outlined
                    size="small"
                    @click="$refs.kmlInput.click()"
                  />
                  <span class="kml-no-file">No file selected</span>
                </template>
                <template v-else>
                  <div class="kml-file-chip">
                    <i class="pi pi-file-o kml-file-chip-icon" />
                    <span class="kml-file-chip-name">{{ kmlFile.name }}</span>
                  </div>
                  <Button
                    label="Change"
                    icon="pi pi-refresh"
                    severity="secondary"
                    text
                    size="small"
                    @click="$refs.kmlInput.click()"
                  />
                </template>
              </div>

              <Message v-if="kmlError" severity="error" :closable="false">{{ kmlError }}</Message>

              <div v-else-if="kmlPolygons.length === 1" class="kml-done">
                <i class="pi pi-check-circle done-icon" />
                <span>
                  {{ kmlPolygons[0].name ?? 'Polygon' }} loaded
                  <span class="kml-pt-count">({{ kmlPolygons[0].border.length }} points)</span>
                </span>
              </div>

              <template v-else-if="kmlPolygons.length > 1">
                <p class="kml-hint">{{ kmlPolygons.length }} polygons found. Select one to use:</p>
                <div class="kml-picker">
                  <button
                    type="button"
                    v-for="(poly, idx) in kmlPolygons"
                    :key="idx"
                    class="kml-poly-row"
                    :class="{ 'kml-poly-row--selected': selectedKmlIndex === idx }"
                    @click="selectedKmlIndex = idx"
                  >
                    <i class="pi pi-map-marker kml-poly-icon" />
                    <span class="kml-poly-name">{{ poly.name ?? `Polygon ${idx + 1}` }}</span>
                    <span class="kml-poly-pts">{{ poly.border.length }} pts</span>
                    <i v-if="selectedKmlIndex === idx" class="pi pi-check kml-poly-check" />
                  </button>
                </div>
              </template>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </div>
</template>

<style scoped>
.area-create-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.create-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
  min-height: 2.75rem;
}

.create-header-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.create-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--p-text-color);
  white-space: nowrap;
}

.create-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.create-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.common-fields {
  padding: 0.625rem 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex-shrink: 0;
}

.field-row {
  display: flex;
  /* The global .form-field in forms.css is column; a scoped rule only overrides what it names. */
  flex-direction: row;
  align-items: flex-start;
  gap: 0.625rem;
}

/* FormField renders the label, so it carries no scope id of this file. */
.field-row > :deep(.form-field__label) {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-weight: 500;
  width: 6rem;
  flex-shrink: 0;
  padding-top: 0.35rem;
}

.required {
  color: var(--p-red-400);
}

.field-input {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
}

:deep(.field-input.p-textarea) {
  resize: none;
}

.source-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.source-tabs .p-tabpanels) {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.875rem;
}

:deep(.source-tabs .p-tablist) {
  padding: 0 0.875rem;
}

.draw-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.draw-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}

.draw-controls-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.draw-controls-sep {
  font-size: 1rem;
  color: var(--p-text-muted-color);
  line-height: 1;
  flex-shrink: 0;
}

.draw-active {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  font-size: 0.8125rem;
}

.draw-active p {
  margin: 0;
  color: var(--p-primary-color);
  font-weight: 500;
  line-height: 1.5;
}

.draw-done {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-green-500);
}

.done-icon {
  font-size: 1rem;
}

.coords-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.coords-hint {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.coords-table {
  font-size: 0.8125rem;
}

:deep(.coords-table .p-datatable-tbody > tr > td) {
  padding: 0.25rem 0.375rem;
}

:deep(.coords-table .p-datatable-thead > tr > th) {
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
}

.coord-input {
  width: 100%;
}

:deep(.coord-input input) {
  font-size: 0.8125rem;
}

.row-index {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.add-row-btn {
  align-self: flex-start;
}

.kml-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.kml-input-hidden {
  display: none;
}

.kml-file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.kml-no-file {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.kml-file-chip {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm);
  font-size: 0.8125rem;
  min-width: 0;
  max-width: 18rem;
}

.kml-file-chip-icon {
  font-size: 0.875rem;
  color: var(--p-primary-color);
  flex-shrink: 0;
}

.kml-file-chip-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  color: var(--p-text-color);
}

.kml-done {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-green-500);
}

.kml-pt-count {
  color: var(--p-text-muted-color);
}

.kml-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.kml-picker {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm);
  overflow: hidden;
}

.kml-poly-row {
  /* Undo the button chrome. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.625rem;
  cursor: pointer;
  font-size: 0.8125rem;
  border-bottom: 1px solid var(--p-surface-border);
  transition: background-color 0.1s;
}

.kml-poly-row:last-child {
  border-bottom: none;
}

.kml-poly-row:hover {
  background: var(--p-surface-hover);
}

.kml-poly-row--selected {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.kml-poly-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.kml-poly-row--selected .kml-poly-icon {
  color: var(--p-highlight-color);
}

.kml-poly-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kml-poly-pts {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.kml-poly-row--selected .kml-poly-pts {
  color: var(--p-highlight-color);
  opacity: 0.75;
}

.kml-poly-check {
  font-size: 0.75rem;
  flex-shrink: 0;
}
</style>
