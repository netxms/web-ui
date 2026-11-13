<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import DrilldownPickerDialog from './DrilldownPickerDialog.vue'
import ObjectIcon from './ObjectIcon.vue'
import { useObject } from '@/queries/useObjectQueries'

const props = defineProps({
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

const selectedId = computed(() => props.modelValue || null)
const { data: selectedObject } = useObject(selectedId)

function onSelect(obj) {
  emit('update:modelValue', obj.id)
  pickerVisible.value = false
}

function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="drilldown-picker-btn">
    <div v-if="selectedObject" class="drilldown-picker-btn__preview">
      <ObjectIcon :object="selectedObject" class="drilldown-picker-btn__icon" />
      <span class="drilldown-picker-btn__name">{{ selectedObject.name }}</span>
      <Button
        aria-label="Choose drilldown target"
        icon="pi pi-pencil"
        size="small"
        text
        severity="secondary"
        class="drilldown-picker-btn__action"
        @click="pickerVisible = true"
      />
      <Button
        aria-label="Clear drilldown target"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        class="drilldown-picker-btn__action"
        @click="clear"
      />
    </div>
    <!-- Only the empty state is a <button>: the filled state holds buttons of its own. -->
    <button v-else type="button" class="drilldown-picker-btn__empty" @click="pickerVisible = true">
      <i class="pi pi-map drilldown-picker-btn__icon" />
      <span class="drilldown-picker-btn__placeholder">Select network map or dashboard</span>
      <i class="pi pi-chevron-down drilldown-picker-btn__chevron" />
    </button>

    <DrilldownPickerDialog v-model:visible="pickerVisible" @select="onSelect" />
  </div>
</template>

<style scoped>
.drilldown-picker-btn__preview,
.drilldown-picker-btn__empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  min-height: 2.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
}

.drilldown-picker-btn__empty {
  /* Now a <button>: undo the chrome a button brings that the preview row never had. */
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.drilldown-picker-btn__empty:hover {
  border-color: var(--p-primary-color);
}

.drilldown-picker-btn__icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.drilldown-picker-btn__placeholder {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drilldown-picker-btn__chevron {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.drilldown-picker-btn__name {
  font-size: 0.8125rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drilldown-picker-btn__action {
  flex-shrink: 0;
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}
</style>
