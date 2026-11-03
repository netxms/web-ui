<script setup>
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'

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
  <div class="network-map-link-script-section">
    <fieldset class="form-fieldset">
      <legend>Link styling script</legend>
      <NxslScriptEditor
        v-model="draft.linkScript"
        hint-key="network-map-link-script"
        show-compile
        :rows="14"
      />
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-link-script-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
