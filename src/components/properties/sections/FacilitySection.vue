<script setup>
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import FormField from '@/components/common/FormField.vue'
import { LIMITS, PROVIDER_ID_MAX_LENGTH } from '@/utils/dataCenterProperties'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="data-center-section">
    <fieldset class="form-fieldset">
      <legend>KPI Engine</legend>
      <div class="form-fields">
        <FormField
          label="Computation provider"
          hint="Leave empty to turn the KPI engine off for this facility."
          v-slot="{ id, describedBy }"
        >
          <InputText
            :id="id"
            v-model="draft.facility.providerId"
            :maxlength="PROVIDER_ID_MAX_LENGTH"
            :aria-describedby="describedBy"
            class="form-input monospace"
          />
        </FormField>
        <FormField
          label="Settlement lag"
          hint="Days a provisional day waits before it is settled."
          v-slot="{ id, describedBy }"
        >
          <div class="number-row">
            <InputNumber
              v-model="draft.facility.settlementLag"
              :input-id="id"
              :min="LIMITS.settlementLag.min"
              :max="LIMITS.settlementLag.max"
              :allow-empty="false"
              :aria-describedby="describedBy"
              show-buttons
              class="number-input"
            />
            <span class="unit">days</span>
          </div>
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style src="./dataCenterSection.css" scoped />
