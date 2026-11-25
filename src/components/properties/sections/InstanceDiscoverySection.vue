<script setup>
import { computed } from 'vue'
import FormField from '@/components/common/FormField.vue'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { PROTOTYPE_DISCOVERY_METHOD_OPTIONS } from '@/utils/objectUtils'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const dataLabel = computed(
  () =>
    PROTOTYPE_DISCOVERY_METHOD_OPTIONS.find((o) => o.value === props.draft.instanceDiscovery.method)
      ?.dataLabel ?? 'Discovery data',
)
</script>

<template>
  <!-- The WebAPI takes the method only on create and returns none of these settings. -->
  <UnderConstructionOverlay message="The server does not provide these settings yet.">
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
              :options="PROTOTYPE_DISCOVERY_METHOD_OPTIONS"
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
              {{ dataLabel }}
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
  </UnderConstructionOverlay>
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
