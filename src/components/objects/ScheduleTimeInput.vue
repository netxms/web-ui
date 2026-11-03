<script setup>
import { ref, computed } from 'vue'
import SelectButton from 'primevue/selectbutton'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

defineProps({
  modelValue: { type: [String, Date], default: null },
})

const emit = defineEmits(['update:modelValue'])

const RELATIVE_PATTERN = /^\+\d+[mhd]$/

const modeOptions = [
  { label: 'Specific time', value: 'absolute' },
  { label: 'Relative', value: 'relative' },
]

const presets = ['+15m', '+30m', '+1h', '+2h', '+1d']

const mode = ref('absolute')
const relativeValue = ref('')
const absoluteValue = ref(null)

const relativeError = computed(() =>
  relativeValue.value && !RELATIVE_PATTERN.test(relativeValue.value)
    ? 'Use a format like +30m, +2h or +1d'
    : '',
)

function selectPreset(preset) {
  relativeValue.value = preset
  emitRelative()
}

function emitRelative() {
  emit('update:modelValue', RELATIVE_PATTERN.test(relativeValue.value) ? relativeValue.value : null)
}

function emitAbsolute() {
  emit('update:modelValue', absoluteValue.value)
}

function onModeChange() {
  emit('update:modelValue', mode.value === 'relative' ? null : absoluteValue.value)
}
</script>

<template>
  <div class="schedule-time-input">
    <SelectButton
      v-model="mode"
      :options="modeOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      @update:model-value="onModeChange"
    />

    <div v-if="mode === 'relative'" class="relative-input">
      <div class="presets">
        <Button
          v-for="preset in presets"
          :key="preset"
          :label="preset"
          size="small"
          text
          :severity="relativeValue === preset ? 'primary' : 'secondary'"
          @click="selectPreset(preset)"
        />
      </div>
      <InputText
        v-model="relativeValue"
        placeholder="+45m"
        class="custom-relative"
        :invalid="!!relativeError"
        @update:model-value="emitRelative"
      />
      <small v-if="relativeError" class="error-text">{{ relativeError }}</small>
    </div>

    <DatePicker
      v-else
      v-model="absoluteValue"
      show-time
      hour-format="24"
      show-icon
      show-clear
      class="absolute-input"
      @update:model-value="emitAbsolute"
    />
  </div>
</template>

<style scoped>
.schedule-time-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.relative-input {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.custom-relative {
  width: 100%;
}

.absolute-input {
  width: 100%;
}

.absolute-input :deep(.p-inputtext) {
  width: 100%;
}

.error-text {
  color: var(--p-form-field-invalid-border-color, var(--p-red-500));
}
</style>
