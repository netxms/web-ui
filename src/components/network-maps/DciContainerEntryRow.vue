<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useObject, useDciCurrentValues } from '@/queries/useObjectQueries'

/**
 * A component so each row owns its queries (hooks cannot be created per v-for item).
 * Entry: { nodeId, dciId, type, instance, column, formatString } (legacy MapDataSource).
 */
const props = defineProps({
  entry: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const emit = defineEmits(['update', 'remove', 'move'])

const nodeId = computed(() => props.entry.nodeId ?? null)
const { data: nodeObject } = useObject(nodeId)
const { data: currentValues, isLoading } = useDciCurrentValues(nodeId)

const nodeLabel = computed(() => nodeObject.value?.name ?? `Node #${props.entry.nodeId}`)

const dciOptions = computed(() => {
  const options = (currentValues.value?.values ?? []).map((v) => ({
    label: `${v.description} (#${v.id})`,
    value: Number(v.id),
  }))
  // A stale DCI id stays selectable so opening the dialog does not clear it
  if (props.entry.dciId && !options.some((o) => o.value === props.entry.dciId)) {
    options.unshift({ label: `DCI #${props.entry.dciId}`, value: props.entry.dciId })
  }
  return options
})
</script>

<template>
  <div class="dci-entry-row">
    <span class="dci-entry-node" :title="nodeLabel">{{ nodeLabel }}</span>
    <Select
      :model-value="entry.dciId"
      :options="dciOptions"
      option-label="label"
      option-value="value"
      :loading="isLoading"
      :placeholder="isLoading ? 'Loading DCIs…' : 'Select DCI'"
      filter
      size="small"
      class="dci-entry-select"
      @update:model-value="emit('update', { dciId: $event })"
    />
    <InputText
      :model-value="entry.formatString"
      size="small"
      placeholder="Format (e.g. %s bps)"
      class="dci-entry-format"
      @update:model-value="emit('update', { formatString: $event })"
    />
    <Button
      aria-label="Move entry up"
      icon="pi pi-chevron-up"
      size="small"
      text
      severity="secondary"
      :disabled="index === 0"
      @click="emit('move', -1)"
    />
    <Button
      aria-label="Move entry down"
      icon="pi pi-chevron-down"
      size="small"
      text
      severity="secondary"
      :disabled="index === count - 1"
      @click="emit('move', 1)"
    />
    <Button
      icon="pi pi-times"
      size="small"
      text
      severity="danger"
      @click="emit('remove')"
      aria-label="Remove entry"
    />
  </div>
</template>

<style scoped>
.dci-entry-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0;
}

.dci-entry-node {
  width: 6.5rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dci-entry-select {
  flex: 1.4;
  min-width: 0;
}

.dci-entry-format {
  flex: 1;
  min-width: 0;
}
</style>
