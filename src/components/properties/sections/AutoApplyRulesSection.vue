<script setup>
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
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
  <div class="auto-apply-rules-section">
    <fieldset class="form-fieldset">
      <legend>Automatic Apply</legend>
      <div class="form-fields">
        <div class="form-field full-width">
          <label class="form-label" for="auto-apply-exclusion-group">Exclusion group</label>
          <InputText
            id="auto-apply-exclusion-group"
            v-model="draft.autoApply.exclusionGroup"
            class="form-input"
          />
        </div>
        <label class="flag-row">
          <Checkbox v-model="draft.autoApply.autoApply" :binary="true" />
          <span>Apply this template automatically to objects selected by filter</span>
        </label>
        <label class="flag-row" :class="{ 'flag-row--disabled': !draft.autoApply.autoApply }">
          <Checkbox
            v-model="draft.autoApply.autoRemove"
            :binary="true"
            :disabled="!draft.autoApply.autoApply"
          />
          <span
            >Remove this template automatically when object no longer passes through filter</span
          >
        </label>
        <p class="flag-hint">(Removal is immediate when object no longer matches filter)</p>
      </div>
    </fieldset>

    <DetailCard title="Filtering Script" :wide="true">
      <div class="card-section">
        <NxslScriptEditor
          v-model="draft.autoApply.source"
          placeholder="// NXSL script&#10;return true;"
          hint-key="template-auto-apply"
          showCompile
        />
      </div>
    </DetailCard>
  </div>
</template>

<style scoped>
.auto-apply-rules-section {
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

.flag-hint {
  margin: -0.25rem 0 0 1.625rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.card-section {
  padding: 0.75rem;
}
</style>
