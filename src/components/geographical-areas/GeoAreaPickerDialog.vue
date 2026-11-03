<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import GeoAreaMapPreview from './GeoAreaMapPreview.vue'
import { useGeographicalAreas } from '@/queries/useGeographicalAreaQueries'

const props = defineProps({
  visible: { type: Boolean, required: true },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'update:modelValue'])

const search = ref('')
const hoveredArea = ref(null)

// Confirmed on Select, discarded on Cancel
const pendingIds = ref([])

watch(
  () => props.visible,
  (open) => {
    if (open) {
      pendingIds.value = [...(props.modelValue ?? [])]
      search.value = ''
      hoveredArea.value = null
    }
  },
)

const { data: areas } = useGeographicalAreas()

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (areas.value ?? []).filter((a) => !q || a.name.toLowerCase().includes(q))
})

const previewArea = computed(() => {
  if (hoveredArea.value) return hoveredArea.value
  if (pendingIds.value.length > 0) {
    return (areas.value ?? []).find((a) => pendingIds.value.includes(a.id)) ?? null
  }
  return null
})

function isSelected(id) {
  return pendingIds.value.includes(id)
}

function toggle(id) {
  if (isSelected(id)) {
    pendingIds.value = pendingIds.value.filter((x) => x !== id)
  } else {
    pendingIds.value = [...pendingIds.value, id]
  }
}

function confirm() {
  emit('update:modelValue', [...pendingIds.value])
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Geographical Areas"
    :style="{ width: '780px', maxWidth: '95vw' }"
    :modal="true"
    :draggable="false"
    class="area-picker-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <div class="picker-list-panel">
        <InputText
          v-model="search"
          data-filter-input
          placeholder="Search areas..."
          class="picker-search"
          autofocus
        />
        <div class="picker-list">
          <!-- `aria-pressed` carries the selection; the check icon is decorative. Focus
               previews the area on the map like hover does. -->
          <button
            v-for="area in filtered"
            :key="area.id"
            type="button"
            class="area-row"
            :class="{ selected: isSelected(area.id) }"
            :aria-pressed="isSelected(area.id)"
            @click="toggle(area.id)"
            @mouseenter="hoveredArea = area"
            @focus="hoveredArea = area"
            @mouseleave="hoveredArea = null"
            @blur="hoveredArea = null"
          >
            <i
              class="pi area-row__check"
              :class="isSelected(area.id) ? 'pi-check-circle' : 'pi-circle'"
              aria-hidden="true"
            />
            <span class="area-row__name">{{ area.name }}</span>
          </button>
          <div v-if="filtered.length === 0" class="picker-empty">No areas found.</div>
        </div>
      </div>

      <div class="picker-map-panel">
        <GeoAreaMapPreview :area="previewArea" />
      </div>
    </div>

    <template #footer>
      <div class="picker-footer">
        <span class="picker-count">
          {{ pendingIds.length }} area{{ pendingIds.length !== 1 ? 's' : '' }} selected
        </span>
        <div class="picker-footer-actions">
          <Button label="Cancel" severity="secondary" text size="small" @click="cancel" />
          <Button label="Select" size="small" @click="confirm" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  gap: 0.75rem;
  height: 420px;
}

.picker-list-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 45%;
  min-width: 0;
}

.picker-search {
  width: 100%;
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius);
}

/* Undo the button chrome: laid out as a full-width row. */
.area-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  cursor: pointer;
  border: none;
  border-bottom: 1px solid var(--p-surface-border);
  border-radius: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  transition: background 0.1s;
}

.area-row:last-child {
  border-bottom: none;
}

.area-row:hover {
  background: var(--p-surface-hover);
}

.area-row.selected {
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-content-background));
}

.area-row__check {
  font-size: 0.875rem;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.area-row.selected .area-row__check {
  color: var(--p-primary-color);
}

.area-row__name {
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-empty {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.picker-map-panel {
  flex: 1;
  min-width: 0;
  border-radius: var(--p-border-radius);
  overflow: hidden;
  border: 1px solid var(--p-surface-border);
}

.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.picker-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.picker-footer-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
