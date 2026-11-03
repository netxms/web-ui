<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Popover from 'primevue/popover'
import { DEFAULT_TIME_PRESET, TIME_PRESETS, getTimePreset } from '@/utils/logQueryModel'
import { formatDateTime } from '@/utils/timeFormat'

// Boundaries are resolved server-side (`relative`, `currentPeriod`) from the offset the model
// sends, so "today" is today in the user's zone.
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ preset: DEFAULT_TIME_PRESET, from: null, to: null }),
  },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const popover = ref(null)
const customFrom = ref(null)
const customTo = ref(null)

const rolling = TIME_PRESETS.filter((preset) => preset.unit)
const calendar = TIME_PRESETS.filter((preset) => preset.period)

const label = computed(() => {
  const { preset, from, to } = props.modelValue
  if (preset !== 'custom') return getTimePreset(preset)?.label ?? 'Time range'
  const start = formatDateTime(from)
  const end = formatDateTime(to)
  if (start && end) return `${start} - ${end}`
  if (start) return `After ${start}`
  if (end) return `Before ${end}`
  return 'Custom range'
})

watch(
  () => props.modelValue,
  (value) => {
    customFrom.value = value.from ? new Date(value.from) : null
    customTo.value = value.to ? new Date(value.to) : null
  },
  { immediate: true, deep: true },
)

function toggle(event) {
  popover.value.toggle(event)
}

function choose(presetId) {
  emit('update:modelValue', { preset: presetId, from: null, to: null })
  popover.value.hide()
}

function applyCustom() {
  emit('update:modelValue', {
    preset: 'custom',
    from: customFrom.value ? customFrom.value.toISOString() : null,
    to: customTo.value ? customTo.value.toISOString() : null,
  })
  popover.value.hide()
}
</script>

<template>
  <div class="log-time-range">
    <Button
      icon="pi pi-clock"
      :label="label"
      size="small"
      severity="secondary"
      outlined
      :disabled="disabled"
      class="time-range-button"
      @click="toggle"
    />

    <Popover ref="popover" class="time-range-popover">
      <div class="time-range-panel">
        <div class="time-range-columns">
          <div class="time-range-group">
            <div class="time-range-label">Rolling</div>
            <button
              v-for="preset in rolling"
              :key="preset.id"
              class="time-range-option"
              :class="{ active: modelValue.preset === preset.id }"
              @click="choose(preset.id)"
            >
              {{ preset.label }}
            </button>
          </div>

          <div class="time-range-group">
            <div class="time-range-label">Calendar</div>
            <button
              v-for="preset in calendar"
              :key="preset.id"
              class="time-range-option"
              :class="{ active: modelValue.preset === preset.id }"
              @click="choose(preset.id)"
            >
              {{ preset.label }}
            </button>
            <button
              class="time-range-option"
              :class="{ active: modelValue.preset === 'any' }"
              @click="choose('any')"
            >
              Any time
            </button>
          </div>
        </div>

        <div class="time-range-custom">
          <div class="time-range-label">Custom range</div>
          <div class="time-range-fields">
            <DatePicker
              v-model="customFrom"
              show-time
              hour-format="24"
              placeholder="From"
              size="small"
              show-button-bar
            />
            <span class="time-range-sep">to</span>
            <DatePicker
              v-model="customTo"
              show-time
              hour-format="24"
              placeholder="To"
              size="small"
              show-button-bar
            />
          </div>
          <p class="time-range-hint">Leave one side empty for an open-ended range.</p>
          <Button
            label="Apply"
            size="small"
            :disabled="!customFrom && !customTo"
            @click="applyCustom"
          />
        </div>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.time-range-button {
  white-space: nowrap;
}

.time-range-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 22rem;
}

.time-range-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.time-range-group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.time-range-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.25rem;
}

.time-range-option {
  display: block;
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--p-text-color);
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.time-range-option:hover {
  background: var(--p-surface-hover);
}

.time-range-option.active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  font-weight: 600;
}

.time-range-custom {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
  border-top: 1px solid var(--p-surface-border);
  padding-top: 0.75rem;
}

.time-range-fields {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-range-sep {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.time-range-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
