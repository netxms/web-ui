<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import EventPickerDialog from './EventPickerDialog.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'

// One event, by code. Wrap it in a `FormField` with `group`: it has no single input to label.
const props = defineProps({
  /** Event code; 0 or null for none. */
  modelValue: { type: Number, default: null },
  clearable: { type: Boolean, default: false },
  emptyLabel: { type: String, default: '(none)' },
})

const emit = defineEmits(['update:modelValue'])

const { data: eventTemplatesData } = useEventTemplates()

const pickerVisible = ref(false)

const eventName = computed(() => {
  if (!props.modelValue) return null
  return (eventTemplatesData.value ?? []).find((t) => t.code === props.modelValue)?.name ?? null
})
</script>

<template>
  <div class="event-select-field">
    <span v-if="modelValue" class="event-select-value">
      <template v-if="eventName">
        {{ eventName }}<span class="event-select-code">({{ modelValue }})</span>
      </template>
      <!-- Not in the template list: deleted, or the list is still loading or refused. -->
      <template v-else>#{{ modelValue }}</template>
    </span>
    <span v-else class="event-select-empty">{{ emptyLabel }}</span>
    <Button
      label="Select..."
      icon="pi pi-list"
      size="small"
      severity="secondary"
      outlined
      class="event-select-btn"
      @click="pickerVisible = true"
    />
    <Button
      v-if="clearable && modelValue"
      icon="pi pi-times"
      text
      rounded
      severity="secondary"
      size="small"
      aria-label="Clear"
      class="event-select-btn"
      @click="emit('update:modelValue', 0)"
    />
    <EventPickerDialog
      v-model:visible="pickerVisible"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.event-select-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  min-height: 2rem;
}

.event-select-value {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-select-code {
  margin-left: 0.25rem;
  color: var(--p-text-muted-color);
}

.event-select-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.event-select-btn {
  flex-shrink: 0;
}
</style>
