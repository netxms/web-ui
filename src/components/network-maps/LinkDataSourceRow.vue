<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import MacroInputField from '@/components/common/MacroInputField.vue'
import { useObject, useDciCurrentValues } from '@/queries/useObjectQueries'
import { DCI_FORMAT_MACROS } from '@/utils/macroDefinitions'
import { linkDataDirection, linkDirectionOptions } from '@/utils/networkMapUtils'

/**
 * A component so each row owns its queries (hooks cannot be created per v-for item).
 * Entry: { nodeId, dciId, type, instance, column, formatString, system, location, direction }
 * (legacy MapLinkDataSource).
 */
const props = defineProps({
  entry: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  /** For the direction choices ("A -> B"). */
  element1Name: { type: String, default: '' },
  element2Name: { type: String, default: '' },
})

const emit = defineEmits(['update', 'remove', 'move'])

const LOCATION_OPTIONS = [
  { label: 'Center', value: 'CENTER' },
  { label: 'Object 1', value: 'OBJECT1' },
  { label: 'Object 2', value: 'OBJECT2' },
]

const directionOptions = computed(() =>
  linkDirectionOptions(props.element1Name, props.element2Name),
)

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
  <div class="link-dci-row">
    <span class="link-dci-node" :title="nodeLabel">{{ nodeLabel }}</span>
    <Select
      :model-value="entry.dciId"
      :options="dciOptions"
      option-label="label"
      option-value="value"
      :loading="isLoading"
      :placeholder="isLoading ? 'Loading DCIs…' : 'Select DCI'"
      filter
      size="small"
      class="link-dci-select"
      @update:model-value="emit('update', { dciId: $event })"
    />
    <MacroInputField
      :model-value="entry.formatString ?? ''"
      :macros="DCI_FORMAT_MACROS"
      size="small"
      placeholder="Format (%{m,u}s)"
      class="link-dci-format"
      @update:model-value="emit('update', { formatString: $event })"
    />
    <Select
      :model-value="entry.location ?? 'CENTER'"
      :options="LOCATION_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="link-dci-location"
      @update:model-value="emit('update', { location: $event })"
    />
    <Select
      :model-value="linkDataDirection(entry.direction)"
      :options="directionOptions"
      option-label="label"
      option-value="value"
      size="small"
      aria-label="Data direction"
      class="link-dci-direction"
      @update:model-value="emit('update', { direction: $event })"
    />
    <Button
      aria-label="Move data source up"
      icon="pi pi-chevron-up"
      size="small"
      text
      severity="secondary"
      :disabled="index === 0"
      @click="emit('move', -1)"
    />
    <Button
      aria-label="Move data source down"
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
      aria-label="Remove data source"
    />
  </div>
</template>

<style scoped>
.link-dci-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0;
}

.link-dci-node {
  width: 6.5rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-dci-select {
  flex: 1.4;
  min-width: 0;
}

.link-dci-format {
  flex: 1;
  min-width: 0;
}

.link-dci-location {
  width: 6.75rem;
  flex-shrink: 0;
}

.link-dci-direction {
  width: 9rem;
  flex-shrink: 0;
}
</style>
