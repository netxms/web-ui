<script setup>
import FormField from '@/components/common/FormField.vue'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const METHOD_OPTIONS = [
  { value: 0, label: 'Agent List' },
  { value: 1, label: 'Agent Table' },
  { value: 2, label: 'Script' },
]

const NAME_LABELS = {
  0: 'List name',
  1: 'Table name',
  2: 'Script name',
}
</script>

<template>
  <div class="instance-discovery-section">
    <fieldset class="form-fieldset">
      <legend>Instance Discovery</legend>
      <div class="form-fields">
        <div class="form-field">
          <label class="form-label" for="instance-discovery-method">
            Instance discovery method
          </label>
          <Select
            id="instance-discovery-method"
            v-model="draft.instanceDiscovery.method"
            :options="METHOD_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </div>

        <FormField label="Source" group class="full-width">
          <ObjectPickerField
            v-model="draft.instanceDiscovery.source"
            empty-label="(none)"
            dialog-title="Select Source Object"
          />
        </FormField>

        <div class="form-field">
          <label class="form-label" for="instance-discovery-name">
            {{ NAME_LABELS[draft.instanceDiscovery.method] }}
          </label>
          <InputText
            id="instance-discovery-name"
            v-model="draft.instanceDiscovery.name"
            class="form-input"
          />
        </div>
      </div>
    </fieldset>

    <DetailCard title="Script" :wide="true">
      <div class="card-section">
        <NxslScriptEditor
          v-model="draft.instanceDiscovery.script"
          placeholder="// NXSL script&#10;return true;"
          hint-key="business-service-prototype-instance-discovery"
          showCompile
        />
      </div>
    </DetailCard>
  </div>
</template>

<style scoped>
.instance-discovery-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-section {
  padding: 0.75rem;
}
</style>
