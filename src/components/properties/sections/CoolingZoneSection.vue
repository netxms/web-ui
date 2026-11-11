<script setup>
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import { COOLING_ZONE_TYPE_OPTIONS } from '@/utils/dataCenterProperties'

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
      <legend>Cooling Zone</legend>
      <div class="form-fields">
        <FormField label="Zone type" v-slot="{ id }">
          <Select
            v-model="draft.coolingZone.zoneType"
            :input-id="id"
            :options="COOLING_ZONE_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="select-input"
          />
        </FormField>
        <FormField label="Rated capacity" hint="0 = not declared" v-slot="{ id, describedBy }">
          <div class="number-row">
            <InputNumber
              v-model="draft.coolingZone.ratedCapacity"
              :input-id="id"
              :min="0"
              :max="2147483647"
              :allow-empty="false"
              :aria-describedby="describedBy"
              class="number-input"
            />
            <span class="unit">W</span>
          </div>
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style src="./dataCenterSection.css" scoped />
