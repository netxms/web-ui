<script setup>
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const DISABLE_FLAGS = [
  { key: 'disableAgent', label: 'Disable usage of NetXMS agent for all polls' },
  { key: 'disableSNMP', label: 'Disable usage of SNMP for all polls' },
  { key: 'disableICMP', label: 'Disable usage of ICMP pings for status polling' },
  { key: 'disableSSH', label: 'Disable usage of SSH for all polls' },
  { key: 'disableVNC', label: 'Disable VNC detection' },
  { key: 'disableSMCLPProperties', label: 'Disable SM-CLP properties metadata' },
  { key: 'disableEtherNetIP', label: 'Disable usage of EtherNet/IP for all polls' },
  { key: 'disableModbus', label: 'Disable usage of Modbus for all polls' },
  { key: 'disable8021xStatusPoll', label: 'Disable 802.1x port state checking' },
  { key: 'disableRoutePoll', label: 'Disable routing table polling' },
  { key: 'disableTopologyPoll', label: 'Disable topology polling' },
  { key: 'disableDiscoveryPoll', label: 'Disable network discovery polling' },
  { key: 'disablePerfCount', label: 'Disable Windows performance counters' },
  { key: 'disableStatusPoll', label: 'Disable status polling' },
  { key: 'disableConfigurationPoll', label: 'Disable configuration polling' },
  { key: 'disableDataCollection', label: 'Disable data collection' },
]

const IFXTABLE_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Enable' },
  { value: 2, label: 'Disable' },
]
</script>

<template>
  <div class="polling-section">
    <fieldset class="form-fieldset">
      <legend>Poller node</legend>
      <ObjectPickerField
        v-model="draft.polling.pollerNode"
        empty-label="(poll from server)"
        dialog-title="Select Poller Node"
        hint="All network services of this node will be polled from the poller node specified here, if not overridden by network service settings."
      />
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Status change</legend>
      <div class="form-fields">
        <FormField label="Required poll count for status change" group>
          <div class="poll-count-row">
            <InputNumber
              v-model="draft.polling.requiredPollCount"
              :min="0"
              :max="100"
              show-buttons
              class="poll-count-input"
            />
            <span class="form-hint">0 = use system default</span>
          </div>
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Disabled protocols and poll types</legend>
      <div class="flags-grid">
        <label v-for="flag in DISABLE_FLAGS" :key="flag.key" class="flag-row">
          <Checkbox v-model="draft.polling.flags[flag.key]" :binary="true" />
          <span class="flag-label">{{ flag.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Interface settings</legend>
      <div class="form-fields">
        <FormField label="Use ifXTable for interface polling" class="triple-field" v-slot="{ id }">
          <SelectButton
            :input-id="id"
            v-model="draft.polling.useIfXTable"
            :options="IFXTABLE_OPTIONS"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.polling-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

.flags-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1.5rem;
}

.flag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.8125rem;
  user-select: none;
}

.flag-label {
  line-height: 1.3;
}

.triple-field {
  max-width: 28rem;
}
</style>
