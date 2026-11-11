<script setup>
// The WebAPI's object PATCH takes a rack's width and depth, not its height or numbering.
import InputNumber from 'primevue/inputnumber'
import FormField from '@/components/common/FormField.vue'
import { LIMITS } from '@/utils/dataCenterProperties'

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
      <legend>Cabinet</legend>
      <div class="form-fields">
        <div class="form-row">
          <FormField label="Width" v-slot="{ id }">
            <div class="number-row">
              <InputNumber
                v-model="draft.width"
                :input-id="id"
                :min="LIMITS.cabinet.min"
                :max="LIMITS.cabinet.max"
                :allow-empty="false"
                show-buttons
                :step="50"
                class="number-input"
              />
              <span class="unit">mm</span>
            </div>
          </FormField>
          <FormField label="Depth" v-slot="{ id }">
            <div class="number-row">
              <InputNumber
                v-model="draft.depth"
                :input-id="id"
                :min="LIMITS.cabinet.min"
                :max="LIMITS.cabinet.max"
                :allow-empty="false"
                show-buttons
                :step="50"
                class="number-input"
              />
              <span class="unit">mm</span>
            </div>
          </FormField>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Units</legend>
      <div class="form-fields">
        <div class="form-row">
          <FormField label="Height" group>
            <div class="form-value">{{ object.height }}U</div>
          </FormField>
          <FormField label="Numbering" group>
            <div class="form-value">
              {{ object.topBottomNumbering ? 'Top to bottom' : 'Bottom to top' }}
            </div>
          </FormField>
        </div>
        <p class="section-hint">Height and numbering cannot be changed from here yet.</p>
      </div>
    </fieldset>
  </div>
</template>

<style src="./dataCenterSection.css" scoped />
