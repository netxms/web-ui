<script setup>
import Checkbox from 'primevue/checkbox'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="auto-bind-section">
    <fieldset class="form-fieldset">
      <legend>Automatic Binding</legend>
      <div class="form-fields">
        <label class="flag-row">
          <Checkbox v-model="draft.autoBindFilters[0].autoBind" :binary="true" />
          <span>Automatically bind objects matching the filter</span>
        </label>
        <label
          class="flag-row"
          :class="{ 'flag-row--disabled': !draft.autoBindFilters[0].autoBind }"
        >
          <Checkbox
            v-model="draft.autoBindFilters[0].autoUnbind"
            :binary="true"
            :disabled="!draft.autoBindFilters[0].autoBind"
          />
          <span>Automatically unbind objects that no longer match the filter</span>
        </label>
      </div>
    </fieldset>

    <DetailCard title="Filter Script" :wide="true">
      <div class="card-section">
        <NxslScriptEditor
          v-model="draft.autoBindFilters[0].source"
          placeholder="// NXSL script&#10;return true;"
          showCompile
        />
      </div>
    </DetailCard>
  </div>
</template>

<style scoped>
.auto-bind-section {
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
</style>
