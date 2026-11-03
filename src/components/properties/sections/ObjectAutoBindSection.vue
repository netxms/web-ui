<script setup>
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import { STATUS_THRESHOLD_OPTIONS } from '@/utils/objectUtils'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="object-auto-bind-section">
    <fieldset class="form-fieldset">
      <legend>Object Auto Bind</legend>
      <div class="form-fields">
        <label class="flag-row">
          <Checkbox v-model="draft.objectAutoBind.autoBind" :binary="true" />
          <span
            >Automatically add objects selected by filter to this business service as check</span
          >
        </label>
        <label class="flag-row" :class="{ 'flag-row--disabled': !draft.objectAutoBind.autoBind }">
          <Checkbox
            v-model="draft.objectAutoBind.autoUnbind"
            :binary="true"
            :disabled="!draft.objectAutoBind.autoBind"
          />
          <span>Automatically remove objects selected by filter from this business service</span>
        </label>
        <div class="form-field">
          <label class="form-label" for="object-auto-bind-status-threshold">
            Status Threshold
          </label>
          <Select
            id="object-auto-bind-status-threshold"
            v-model="draft.objectAutoBind.statusThreshold"
            :options="STATUS_THRESHOLD_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          >
            <template #value="{ value }">
              <div class="status-option">
                <span
                  class="status-dot"
                  :class="`status-dot--${STATUS_THRESHOLD_OPTIONS.find((o) => o.value === value)?.key}`"
                />
                {{ STATUS_THRESHOLD_OPTIONS.find((o) => o.value === value)?.label }}
              </div>
            </template>
            <template #option="{ option }">
              <div class="status-option">
                <span class="status-dot" :class="`status-dot--${option.key}`" />
                {{ option.label }}
              </div>
            </template>
          </Select>
        </div>
      </div>
    </fieldset>

    <DetailCard title="Filtering Script" :wide="true">
      <div class="card-section">
        <NxslScriptEditor
          v-model="draft.objectAutoBind.source"
          placeholder="// NXSL script&#10;return true;"
          hint-key="business-service-object-auto-bind"
          showCompile
        />
      </div>
    </DetailCard>
  </div>
</template>

<style scoped>
.object-auto-bind-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.flag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
  user-select: none;
}

.flag-row--disabled {
  opacity: 0.5;
  cursor: default;
}

.card-section {
  padding: 0.75rem;
}

.status-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--default {
  background: var(--p-surface-400, #9e9e9e);
}
.status-dot--warning {
  background: var(--netxms-status-warning);
}
.status-dot--minor {
  background: var(--netxms-status-minor);
}
.status-dot--major {
  background: var(--netxms-status-major);
}
.status-dot--critical {
  background: var(--netxms-status-critical);
}
</style>
