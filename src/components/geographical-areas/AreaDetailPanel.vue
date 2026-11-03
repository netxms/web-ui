<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  useUpdateGeographicalArea,
  useDeleteGeographicalArea,
} from '@/queries/useGeographicalAreaQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** @type {{ id: number, name: string, comments: string, bounds: object, geoJson: object } | null} */
  area: { type: Object, default: null },
  isEditingGeometry: { type: Boolean, default: false },
  /** Working copy of the area being edited */
  editGeoJson: { type: Object, default: null },
})

const emit = defineEmits([
  'close',
  'deleted',
  'start-edit-geometry',
  'stop-edit-geometry',
  'discard-edit-geometry',
  'update:editGeoJson',
])

const toast = useToast()
const confirm = useConfirm()

const { mutate: updateArea, isPending: isSaving } = useUpdateGeographicalArea()
const { mutate: deleteArea, isPending: isDeleting } = useDeleteGeographicalArea()

const form = ref({ name: '', comments: '' })

function syncFromArea(area) {
  form.value = { name: area?.name ?? '', comments: area?.comments ?? '' }
}

watch(
  () => props.area,
  (area) => syncFromArea(area),
  { immediate: true },
)

const geoDirty = computed(() => {
  if (!props.editGeoJson || !props.area) return false
  return JSON.stringify(props.editGeoJson) !== JSON.stringify(props.area.geoJson)
})

const isDirty = computed(() => {
  if (!props.area) return false
  const metaDirty =
    form.value.name !== props.area.name || form.value.comments !== props.area.comments
  return metaDirty || geoDirty.value
})

const canSave = computed(
  () => isDirty.value && form.value.name.trim().length > 0 && !isSaving.value,
)

function fmtCoord(val, posLabel, negLabel) {
  if (val == null) return '—'
  const dir = val >= 0 ? posLabel : negLabel
  return `${Math.abs(val).toFixed(4)}° ${dir}`
}

const boundsDisplay = computed(() => {
  const b = props.area?.bounds
  if (!b) return null
  return {
    north: fmtCoord(b.north, 'N', 'S'),
    south: fmtCoord(b.south, 'N', 'S'),
    east: fmtCoord(b.east, 'E', 'W'),
    west: fmtCoord(b.west, 'E', 'W'),
  }
})

function discard() {
  syncFromArea(props.area)
  if (props.isEditingGeometry || geoDirty.value) emit('discard-edit-geometry')
}

function save() {
  if (!canSave.value || !props.area) return
  const geoJson = props.editGeoJson ?? props.area.geoJson
  updateArea(
    { id: props.area.id, name: form.value.name, comments: form.value.comments, geoJson },
    {
      onSuccess: () => {
        toast.add({ severity: 'success', summary: 'Area saved', life: 2500 })
        emit('discard-edit-geometry') // clear staged geometry state after persisting
      },
      onError: () => toast.add({ severity: 'error', summary: 'Failed to save area', life: 3000 }),
    },
  )
}

let nextRowId = 1

/** @type {import('vue').Ref<{id: number, lat: number|null, lng: number|null}[]>} */
const coordRows = ref([])

/** Drops the closing duplicate coordinate */
function syncRowsFromGeoJson(geoJson) {
  if (!geoJson) return
  const ring = geoJson.geometry.coordinates[0]
  coordRows.value = ring.slice(0, -1).map(([lng, lat]) => ({ id: nextRowId++, lat, lng }))
}

const isCompleteRow = (r) => r.lat != null && r.lng != null

watch(
  () => props.editGeoJson,
  (geoJson) => {
    if (!geoJson || !props.isEditingGeometry) return
    // The ring holds only complete rows, so a blank "Add point" row must not count; rebuild only
    // when the map added or removed a vertex.
    const ring = geoJson.geometry.coordinates[0].slice(0, -1) // drop closing point
    const completeRows = coordRows.value.filter(isCompleteRow)
    if (ring.length !== completeRows.length) {
      syncRowsFromGeoJson(geoJson)
    } else {
      // In place, to keep input focus
      ring.forEach(([lng, lat], i) => {
        completeRows[i].lat = lat
        completeRows[i].lng = lng
      })
    }
  },
)

watch(
  () => props.isEditingGeometry,
  (active) => {
    if (active && props.editGeoJson) syncRowsFromGeoJson(props.editGeoJson)
  },
)

const coordTableRef = ref(null)

async function addCoordRow() {
  coordRows.value = [...coordRows.value, { id: nextRowId++, lat: null, lng: null }]
  emitCoordsUpdate()
  // Focusing the new row also scrolls it into view.
  await nextTick()
  coordTableRef.value?.$el.querySelector('tbody tr:last-child input')?.focus()
}

function removeCoordRow(id) {
  if (coordRows.value.length <= 3) return
  coordRows.value = coordRows.value.filter((r) => r.id !== id)
  emitCoordsUpdate()
}

function handleCoordPaste(event, row) {
  const text = (event.clipboardData ?? window.clipboardData).getData('text').trim()
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return
  event.preventDefault()
  row.lat = parseFloat(match[1])
  row.lng = parseFloat(match[2])
  emitCoordsUpdate()
}

function onCoordInput() {
  emitCoordsUpdate()
}

function emitCoordsUpdate() {
  const valid = coordRows.value.filter(isCompleteRow)
  if (valid.length < 3) return
  const coords = valid.map((r) => [r.lng, r.lat])
  coords.push(coords[0]) // close ring
  emit('update:editGeoJson', {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  })
}

function confirmDelete() {
  confirm.require({
    message: `Delete "${props.area?.name}"? This cannot be undone.`,
    header: 'Delete Area',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      deleteArea(
        { id: props.area.id },
        {
          onSuccess: () => {
            toast.add({ severity: 'success', summary: 'Area deleted', life: 2500 })
            emit('deleted')
          },
          onError: (err) => {
            if (err.status === 409) {
              confirmForceDelete()
            } else {
              toast.add({ severity: 'error', summary: 'Failed to delete area', life: 3000 })
            }
          },
        },
      )
    },
  })
}

function confirmForceDelete() {
  confirm.require({
    message: `"${props.area?.name}" is in use by one or more objects. Force delete anyway?`,
    header: 'Area In Use',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Force Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteArea(
        { id: props.area.id, force: true },
        {
          onSuccess: () => {
            toast.add({ severity: 'success', summary: 'Area deleted', life: 2500 })
            emit('deleted')
          },
          onError: () =>
            toast.add({ severity: 'error', summary: 'Failed to delete area', life: 3000 }),
        },
      )
    },
  })
}
</script>

<template>
  <div v-if="area" class="area-detail-panel">
    <div class="detail-header">
      <div class="detail-header-left">
        <i class="pi pi-map-marker detail-icon" />
        <div class="detail-title-group">
          <span class="detail-title">{{ area.name }}</span>
        </div>
      </div>
      <div class="detail-actions">
        <Button
          v-if="isDirty"
          label="Discard"
          severity="secondary"
          text
          size="small"
          @click="discard"
        />
        <Button label="Save" size="small" :disabled="!canSave" :loading="isSaving" @click="save" />
        <Button
          v-if="!isEditingGeometry"
          icon="pi pi-pencil"
          label="Edit Boundary"
          severity="secondary"
          text
          size="small"
          @click="$emit('start-edit-geometry')"
        />
        <Button
          v-else
          label="Done Editing"
          severity="secondary"
          outlined
          size="small"
          @click="$emit('stop-edit-geometry')"
        />
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          aria-label="Delete area"
          :loading="isDeleting"
          @click="confirmDelete"
        />
      </div>
    </div>

    <div class="detail-fields">
      <FormField class="field-row" label="Name" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="form.name"
          class="field-input"
          size="small"
          @keydown.enter="save"
        />
      </FormField>
      <FormField class="field-row" label="Comments" v-slot="{ id }">
        <Textarea
          :id="id"
          v-model="form.comments"
          class="field-input"
          :auto-resize="false"
          rows="2"
          size="small"
        />
      </FormField>

      <div v-if="boundsDisplay && !isEditingGeometry" class="bounds-row">
        <span class="field-label">Extent</span>
        <div class="bounds-values">
          <span class="bound-item">
            <span class="bound-dir">N</span>{{ boundsDisplay.north }}
          </span>
          <span class="bound-sep">·</span>
          <span class="bound-item">
            <span class="bound-dir">S</span>{{ boundsDisplay.south }}
          </span>
          <span class="bound-sep">·</span>
          <span class="bound-item"> <span class="bound-dir">E</span>{{ boundsDisplay.east }} </span>
          <span class="bound-sep">·</span>
          <span class="bound-item"> <span class="bound-dir">W</span>{{ boundsDisplay.west }} </span>
        </div>
      </div>

      <div v-if="isEditingGeometry" class="coord-section">
        <div class="coord-section-header">
          <span class="field-label">Boundary points</span>
          <span class="coord-count">{{ coordRows.length }} points</span>
        </div>
        <DataTable
          ref="coordTableRef"
          :value="coordRows"
          size="small"
          class="coord-table"
          scrollable
          scroll-height="flex"
        >
          <Column header="Latitude" style="width: 45%">
            <template #body="{ data }">
              <InputNumber
                v-model="data.lat"
                :min="-90"
                :max="90"
                :max-fraction-digits="6"
                :use-grouping="false"
                size="small"
                class="coord-input"
                @update:model-value="onCoordInput"
                @paste="handleCoordPaste($event, data)"
              />
            </template>
          </Column>
          <Column header="Longitude" style="width: 45%">
            <template #body="{ data }">
              <InputNumber
                v-model="data.lng"
                :min="-180"
                :max="180"
                :max-fraction-digits="6"
                :use-grouping="false"
                size="small"
                class="coord-input"
                @update:model-value="onCoordInput"
                @paste="handleCoordPaste($event, data)"
              />
            </template>
          </Column>
          <Column style="width: 10%; min-width: 2.5rem">
            <template #body="{ data }">
              <Button
                aria-label="Remove coordinate"
                icon="pi pi-times"
                text
                rounded
                severity="danger"
                size="small"
                :disabled="coordRows.length <= 3"
                @click="removeCoordRow(data.id)"
              />
            </template>
          </Column>
        </DataTable>
        <Button
          icon="pi pi-plus"
          label="Add point"
          text
          size="small"
          class="add-coord-btn"
          @click="addCoordRow"
        />
      </div>
    </div>
  </div>

  <div v-else class="detail-empty">
    <i class="pi pi-map empty-icon" />
    <span>Select an area to view details</span>
  </div>
</template>

<style scoped>
.area-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.detail-header {
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

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.detail-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.detail-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.detail-title {
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--p-text-color);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.detail-fields {
  padding: 0.625rem 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  flex: 1;
}

.field-row {
  display: flex;
  /* The global .form-field in forms.css is column; a scoped rule only overrides what it names. */
  flex-direction: row;
  align-items: flex-start;
  gap: 0.625rem;
}

.field-label,
/* FormField renders the label, so it carries no scope id of this file. */
.field-row > :deep(.form-field__label) {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-weight: 500;
  width: 6rem;
  flex-shrink: 0;
  padding-top: 0.35rem;
}

.field-input {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
}

:deep(.field-input.p-textarea) {
  resize: none;
}

.bounds-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding-top: 0.25rem;
}

.bounds-values {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--p-text-color);
  font-variant-numeric: tabular-nums;
}

.bound-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.bound-dir {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.bound-sep {
  color: var(--p-surface-border);
  padding: 0 0.1rem;
}

.coord-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  /* On a short panel .detail-fields scrolls instead of squeezing the table to nothing. */
  flex: 1 0 14rem;
}

.coord-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.coord-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.coord-table {
  flex: 1;
  min-height: 0;
  font-size: 0.8125rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
  overflow: hidden;
}

:deep(.coord-table .p-datatable-tbody > tr > td) {
  padding: 0.2rem 0.375rem;
}

:deep(.coord-table .p-datatable-thead > tr > th) {
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.coord-input {
  width: 100%;
}

:deep(.coord-input input) {
  font-size: 0.8125rem;
  padding: 0.25rem 0.5rem;
  font-variant-numeric: tabular-nums;
}

.add-coord-btn {
  align-self: flex-start;
  font-size: 0.8125rem;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.4;
}
</style>
