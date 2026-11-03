<script setup>
/**
 * Time window button with a popover of rolling presets and a custom range. The caller resolves
 * the value with `resolveTimeRange` when it sends a request, so a preset always ends at "now".
 * The Logs perspective uses `LogTimeRangePicker`, whose windows can be open-ended.
 */
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Popover from 'primevue/popover'
import { CHART_TIME_PRESETS, resolveTimeRange } from '@/utils/dciChartModel'
import { formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  /** `{ preset, from?, to? }`; `from`/`to` only for `preset: 'custom'`, in Unix seconds. */
  modelValue: { type: Object, required: true },
  /** `{ id, label, seconds }`, from `CHART_TIME_PRESETS`. */
  presets: {
    type: Array,
    default: () => CHART_TIME_PRESETS.filter((preset) => preset.id !== 'custom'),
  },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const popover = ref(null)
const customFrom = ref(null)
const customTo = ref(null)

const label = computed(() => {
  const time = props.modelValue
  if (time.preset !== 'custom') {
    return props.presets.find((preset) => preset.id === time.preset)?.label ?? 'Time range'
  }
  const { timeFrom, timeTo } = resolveTimeRange({ time })
  return `${formatDateTime(timeFrom * 1000)} - ${formatDateTime(timeTo * 1000)}`
})

// Reopening shows the range in effect, including the concrete bounds behind a preset.
watch(
  () => props.modelValue,
  (time) => {
    const { timeFrom, timeTo } = resolveTimeRange({ time })
    customFrom.value = new Date(timeFrom * 1000)
    customTo.value = new Date(timeTo * 1000)
  },
  { immediate: true, deep: true },
)

function choosePreset(id) {
  emit('update:modelValue', { preset: id })
  popover.value.hide()
}

function applyCustomRange() {
  if (customRangeInvalid.value) return
  emit('update:modelValue', {
    preset: 'custom',
    from: Math.floor(customFrom.value.getTime() / 1000),
    to: Math.floor(customTo.value.getTime() / 1000),
  })
  popover.value.hide()
}

const customRangeInvalid = computed(
  () => !customFrom.value || !customTo.value || customTo.value <= customFrom.value,
)
</script>

<template>
  <Button
    icon="pi pi-clock"
    :label="label"
    size="small"
    severity="secondary"
    outlined
    :disabled="disabled"
    @click="popover.toggle($event)"
  />
  <Popover ref="popover">
    <div class="time-panel">
      <div class="time-panel__label">Presets</div>
      <div class="time-panel__presets">
        <button
          v-for="preset in presets"
          :key="preset.id"
          class="time-panel__option"
          :class="{ 'time-panel__option--active': modelValue.preset === preset.id }"
          @click="choosePreset(preset.id)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div class="time-panel__custom">
        <div class="time-panel__label">Custom range</div>
        <div class="time-panel__fields">
          <DatePicker
            v-model="customFrom"
            show-time
            hour-format="24"
            placeholder="From"
            size="small"
            aria-label="Range start"
          />
          <span class="time-panel__sep">to</span>
          <DatePicker
            v-model="customTo"
            show-time
            hour-format="24"
            placeholder="To"
            size="small"
            aria-label="Range end"
          />
          <Button
            label="Apply"
            size="small"
            :disabled="customRangeInvalid"
            @click="applyCustomRange"
          />
        </div>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.time-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 22rem;
}

.time-panel__label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.time-panel__presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.125rem;
}

.time-panel__option {
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: var(--p-border-radius, 6px);
  background: transparent;
  color: var(--p-text-color);
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.time-panel__option:hover {
  background: var(--p-content-hover-background);
}

.time-panel__option--active {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-color);
  font-weight: 600;
}

.time-panel__custom {
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
}

.time-panel__fields {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.375rem;
  flex-wrap: wrap;
}

.time-panel__sep {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
