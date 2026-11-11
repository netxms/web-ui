<script setup>
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import { FEED_TAG_MAX_LENGTH, POWER_DOMAIN_TYPE_OPTIONS } from '@/utils/dataCenterProperties'

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
      <legend>Power Domain</legend>
      <div class="form-fields">
        <FormField label="Domain type" v-slot="{ id }">
          <Select
            v-model="draft.powerDomain.domainType"
            :input-id="id"
            :options="POWER_DOMAIN_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="select-input"
          />
        </FormField>
        <FormField
          label="Feed tag"
          hint="The feed this domain carries, such as A or B. Domains with different tags that feed the same racks back each other up."
          v-slot="{ id, describedBy }"
        >
          <InputText
            :id="id"
            v-model="draft.powerDomain.feedTag"
            :maxlength="FEED_TAG_MAX_LENGTH"
            :aria-describedby="describedBy"
            class="select-input monospace"
          />
        </FormField>
        <FormField label="Rated power" hint="0 = not declared" v-slot="{ id, describedBy }">
          <div class="number-row">
            <InputNumber
              v-model="draft.powerDomain.ratedPower"
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
