<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import AllObjectsPickerDialog from './AllObjectsPickerDialog.vue'
import ObjectPickerDialog from './ObjectPickerDialog.vue'
import ObjectIcon from './ObjectIcon.vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  emptyLabel: { type: String, default: '(none)' },
  dialogTitle: { type: String, default: 'Select Object' },
  /** null uses AllObjectsPickerDialog. */
  perspectives: { type: Array, default: null },
  selectable: { type: Function, default: () => true },
  hint: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

const objectId = computed(() => props.modelValue || null)
const objectIds = computed(() => (objectId.value ? [objectId.value] : []))
const { objectsById } = useObjectsByIds(objectIds)
const selectedObject = computed(() =>
  objectId.value ? (objectsById.value.get(objectId.value) ?? null) : null,
)
const objectName = computed(() => {
  if (!objectId.value) return null
  return selectedObject.value?.name ?? `Node #${objectId.value}`
})

function onSelect(node) {
  emit('update:modelValue', node.id)
  pickerVisible.value = false
}

function clear() {
  emit('update:modelValue', 0)
}
</script>

<template>
  <div class="object-picker-field">
    <div class="opf-row">
      <span v-if="!objectId" class="opf-empty">{{ emptyLabel }}</span>
      <span v-else class="opf-tag">
        <ObjectIcon :object="selectedObject ?? { class: 'Node' }" class="opf-icon" />
        <span class="opf-name">{{ objectName }}</span>
      </span>
      <div class="opf-actions">
        <Button
          label="Choose..."
          icon="pi pi-search"
          size="small"
          outlined
          severity="secondary"
          @click="pickerVisible = true"
        />
        <Button
          v-if="objectId"
          label="Clear"
          icon="pi pi-times"
          size="small"
          outlined
          severity="danger"
          @click="clear"
        />
      </div>
    </div>
    <p v-if="hint" class="opf-hint">{{ hint }}</p>

    <ObjectPickerDialog
      v-if="perspectives"
      v-model:visible="pickerVisible"
      :title="dialogTitle"
      :perspectives="perspectives"
      :selectable="selectable"
      :show-perspective-root="true"
      @select="onSelect"
    />
    <AllObjectsPickerDialog
      v-else
      v-model:visible="pickerVisible"
      :title="dialogTitle"
      :selectable="selectable"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
.opf-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.25rem 0.25rem 0.625rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  min-height: 2.25rem;
}

.opf-empty {
  flex: 1;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.opf-tag {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.opf-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opf-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.opf-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  margin-left: auto;
}

.opf-hint {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  line-height: 1.4;
}
</style>
