<script setup>
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import MapFlagCheckbox from './MapFlagCheckbox.vue'
import { MAP_FLAGS } from '@/utils/networkMapUtils'

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
  <div class="network-map-filter-section">
    <fieldset class="form-fieldset">
      <legend>Object filter script</legend>
      <MapFlagCheckbox
        :draft="draft"
        :bit="MAP_FLAGS.FILTER_OBJECTS"
        label="Apply object filter script"
        hint="When off, the script below is ignored and every discovered object is shown."
      />
      <NxslScriptEditor
        v-model="draft.filter"
        hint-key="network-map-filter"
        show-compile
        :rows="14"
      />
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-filter-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
