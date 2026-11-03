<script setup>
import FormField from '@/components/common/FormField.vue'
import InputText from 'primevue/inputtext'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import DrilldownPickerButton from '@/components/objects/DrilldownPickerButton.vue'
import ObjectIconPreview from '@/components/objects/ObjectIconPreview.vue'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="map-appearance-section">
    <fieldset class="form-fieldset">
      <legend>Map Appearance</legend>
      <div class="form-fields">
        <div class="form-field">
          <label class="form-label" for="prop-name-on-map">Name on Map</label>
          <InputText
            id="prop-name-on-map"
            v-model="draft.nameOnMap"
            placeholder="Defaults to object name"
            style="width: 100%"
          />
        </div>
        <FormField label="Map Image" group>
          <ImagePickerButton v-model="draft.mapImage" label="Select image" />
        </FormField>
        <ObjectIconPreview :object="object" :map-image-id="draft.mapImage" />
        <FormField label="Drill-down Object" group>
          <DrilldownPickerButton v-model="draft.drilldownObjectId" />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.map-appearance-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
