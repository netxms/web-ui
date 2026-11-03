<script setup>
// The flags are read-only: `PATCH /v1/objects/{id}` has no field for interface flags.
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { EXPECTED_STATE, EXPECTED_STATE_OPTIONS, IF_FLAGS } from '@/utils/interfaceDisplay'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

/**
 * Auto is not a choice (see EXPECTED_STATE_OPTIONS), but an interface not polled since the
 * server gave it Auto still has it; show it as the current value rather than a blank select.
 */
const expectedStateOptions = computed(() =>
  props.object.expectedState === EXPECTED_STATE.AUTO
    ? [
        ...EXPECTED_STATE_OPTIONS,
        { value: EXPECTED_STATE.AUTO, label: 'Auto (until the next status poll)', disabled: true },
      ]
    : EXPECTED_STATE_OPTIONS,
)

const FLAGS = [
  { mask: IF_FLAGS.EXCLUDE_FROM_TOPOLOGY, label: 'Exclude this interface from network topology' },
  {
    mask: IF_FLAGS.INCLUDE_IN_ICMP_POLL,
    label: 'Collect ICMP response statistic for this interface',
  },
  { mask: IF_FLAGS.DISABLE_AGENT_STATUS_POLL, label: 'Disable status polling with NetXMS agent' },
  { mask: IF_FLAGS.DISABLE_SNMP_STATUS_POLL, label: 'Disable status polling with SNMP' },
  { mask: IF_FLAGS.DISABLE_ICMP_STATUS_POLL, label: 'Disable status polling with ICMP' },
]

function hasFlag(mask) {
  return ((props.object.flags ?? 0) & mask) !== 0
}
</script>

<template>
  <div class="interface-polling-section">
    <fieldset class="form-fieldset">
      <legend>Status</legend>
      <div class="form-fields">
        <FormField label="Expected state" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.expectedState"
            :options="expectedStateOptions"
            option-label="label"
            option-value="value"
            option-disabled="disabled"
            class="expected-state-input"
          />
        </FormField>
        <FormField label="Required poll count for status change" group>
          <div class="poll-count-row">
            <InputNumber
              v-model="draft.requiredPollCount"
              :min="0"
              :max="1000"
              show-buttons
              class="poll-count-input"
            />
            <span class="form-hint">0 = use system default</span>
          </div>
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Options</legend>
      <UnderConstructionOverlay message="These options cannot be changed from here yet.">
        <div class="flags-list">
          <label v-for="flag in FLAGS" :key="flag.mask" class="flag-row">
            <Checkbox :model-value="hasFlag(flag.mask)" binary disabled />
            <span class="flag-label">{{ flag.label }}</span>
          </label>
        </div>
      </UnderConstructionOverlay>
    </fieldset>
  </div>
</template>

<style scoped>
.interface-polling-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.expected-state-input {
  width: 16rem;
}

.poll-count-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.poll-count-input {
  width: 8rem;
  flex-shrink: 0;
}

:deep(.poll-count-input input) {
  max-width: 100%;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.flags-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.flag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  user-select: none;
}

.flag-label {
  line-height: 1.3;
}
</style>
