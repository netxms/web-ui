<script setup>
import MapFlagCheckbox from './MapFlagCheckbox.vue'
import { MAP_ADVANCED_FLAGS } from '@/utils/networkMapUtils'

/** MF_* flags with no more specific home; the others sit with the control they affect. */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="network-map-advanced-section">
    <fieldset class="form-fieldset">
      <legend>Advanced options</legend>
      <div class="form-fields">
        <MapFlagCheckbox
          v-for="flag in MAP_ADVANCED_FLAGS"
          :key="flag.bit"
          :draft="draft"
          :bit="flag.bit"
          :label="flag.label"
          :hint="flag.hint ?? ''"
        />
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-advanced-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
