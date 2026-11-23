<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import EventPickerDialog from './EventPickerDialog.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { normalizeSeverity, severityLabels } from '@/utils/alarmDisplay'

// One event. Wrap it in a `FormField` with `group`: it has no single input to label.
const props = defineProps({
  /** Event code (0 or null for none), or with `by="name"` its name ('' for none). */
  modelValue: { type: [Number, String], default: null },
  /** What the value holds: DCI thresholds name their events, everything else uses codes. */
  by: { type: String, default: 'code', validator: (v) => v === 'code' || v === 'name' },
  clearable: { type: Boolean, default: false },
  emptyLabel: { type: String, default: '(none)' },
})

const emit = defineEmits(['update:modelValue'])

const { data: eventTemplatesData } = useEventTemplates()

const pickerVisible = ref(false)

const template = computed(() => {
  const value = props.modelValue
  if (!value) return null
  const key = props.by === 'name' ? 'name' : 'code'
  return (eventTemplatesData.value ?? []).find((t) => t[key] === value) ?? null
})

const severityLabel = computed(() =>
  template.value ? severityLabels[normalizeSeverity(template.value.severity)] : 'Unknown event',
)

// The picker works in codes.
const pickerValue = computed(
  () => template.value?.code ?? (props.by === 'code' ? props.modelValue : null),
)

function onPicked(code) {
  if (props.by === 'code') {
    emit('update:modelValue', code)
    return
  }
  const picked = (eventTemplatesData.value ?? []).find((t) => t.code === code)
  emit('update:modelValue', picked?.name ?? '')
}

function clear() {
  emit('update:modelValue', props.by === 'name' ? '' : 0)
}
</script>

<template>
  <div class="event-select-field">
    <div class="event-select-box">
      <template v-if="modelValue">
        <!-- Unknown when not in the template list: deleted, or the list is loading or refused. -->
        <span :title="severityLabel" class="event-select-icon">
          <StatusIcon :status="template?.severity" size="0.875rem" />
        </span>
        <span class="event-select-value">
          <template v-if="template">
            {{ template.name }}<span class="event-select-code">({{ template.code }})</span>
          </template>
          <template v-else>{{ by === 'name' ? modelValue : `#${modelValue}` }}</template>
        </span>
      </template>
      <span v-else class="event-select-empty">{{ emptyLabel }}</span>
      <div class="event-select-actions">
        <Button
          label="Select..."
          icon="pi pi-list"
          size="small"
          severity="secondary"
          outlined
          @click="pickerVisible = true"
        />
        <!-- Not rounded: PrimeVue squares a rounded icon button to 2rem, taller than "Select...". -->
        <Button
          v-if="clearable && modelValue"
          icon="pi pi-times"
          text
          severity="secondary"
          size="small"
          aria-label="Clear"
          @click="clear"
        />
      </div>
    </div>
    <EventPickerDialog
      v-model:visible="pickerVisible"
      :model-value="pickerValue"
      @update:model-value="onPicked"
    />
  </div>
</template>

<style scoped>
.event-select-field {
  min-width: 0;
}

/* Drawn as an input, and exactly as tall as one beside it: an InputText's font, line height and
   padding give the height, and the small buttons sit inside it. */
.event-select-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 1rem;
  line-height: normal;
  min-height: calc(1lh + 2 * var(--p-inputtext-padding-y) + 2px);
  padding: 0 0.125rem 0 0.75rem;
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius);
  background: var(--p-inputtext-background);
}

.event-select-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.event-select-value {
  flex: 1;
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
  flex: 1;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.event-select-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
