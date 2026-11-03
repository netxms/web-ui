<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ColorPicker from 'primevue/colorpicker'
import { useDciCurrentValues } from '@/queries/useObjectQueries'
import { isTemplateDci } from '@/utils/templateDci'

// A component per row so each can hold its own current-values query (hooks cannot be created
// per item in a v-for).
const props = defineProps({
  entry: { type: Object, required: true },
})

const emit = defineEmits(['update', 'remove'])

// Template entries name the DCI by pattern; authoring patterns is legacy-only, so the row shows
// it read-only and keeps the entry intact on save.
const isTemplate = computed(() => isTemplateDci(props.entry))
const templateLabel = computed(() => {
  const { dciName, dciDescription, dciTag } = props.entry
  return `Template: ${dciName || dciDescription || dciTag || '(no pattern)'}`
})

const nodeId = computed(() => (isTemplate.value ? null : (props.entry.nodeId ?? null)))
const { data: currentValues, isLoading } = useDciCurrentValues(nodeId)

const dciOptions = computed(() =>
  (currentValues.value?.values ?? [])
    .filter((v) => !v.isTable) // a table DCI has no scalar value; the table widgets take those
    .map((v) => ({ label: `${v.description} (#${v.id})`, value: Number(v.id) })),
)

const selectedDci = computed({
  get: () => props.entry.dciId ?? null,
  set: (dciId) => {
    // The picker offers scalar DCIs only, so a table cell the entry named no longer applies.
    const patch = { dciId, type: 1, column: '', instance: '' }
    if (!props.entry.name) {
      const match = (currentValues.value?.values ?? []).find((v) => Number(v.id) === dciId)
      if (match?.description) patch.name = match.description
    }
    emit('update', patch)
  },
})

const colorValue = computed({
  get: () => (props.entry.color ? props.entry.color.replace(/^#/, '') : null),
  set: (v) => emit('update', { color: v ? '#' + String(v).replace(/^#/, '') : null }),
})

const nodeLabel = computed(() => {
  if (isTemplate.value) return 'Context object'
  return props.entry.nodeName ? `${props.entry.nodeName}` : `Node #${props.entry.nodeId}`
})
</script>

<template>
  <div class="dci-row">
    <span class="dci-row-node" :title="nodeLabel">{{ nodeLabel }}</span>
    <span v-if="isTemplate" class="dci-row-template" :title="templateLabel">
      {{ templateLabel }}
    </span>
    <Select
      v-if="!isTemplate"
      v-model="selectedDci"
      :options="dciOptions"
      option-label="label"
      option-value="value"
      :loading="isLoading"
      :placeholder="isLoading ? 'Loading DCIs…' : 'Select DCI'"
      filter
      size="small"
      class="dci-row-select"
    />
    <InputText
      :model-value="entry.name"
      size="small"
      placeholder="Display name"
      class="dci-row-name"
      @update:model-value="emit('update', { name: $event })"
    />
    <ColorPicker v-model="colorValue" />
    <Button
      icon="pi pi-times"
      size="small"
      text
      severity="danger"
      @click="emit('remove')"
      aria-label="Remove data source"
    />
  </div>
</template>

<style scoped>
.dci-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0;
}

.dci-row-node {
  width: 7rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dci-row-template {
  flex: 1.4;
  min-width: 0;
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dci-row-select {
  flex: 1.4;
  min-width: 0;
}

.dci-row-name {
  flex: 1;
  min-width: 0;
}
</style>
