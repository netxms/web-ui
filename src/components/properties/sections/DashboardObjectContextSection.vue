<script setup>
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import FormField from '@/components/common/FormField.vue'

// draft is a shared mutable object from usePropertyEditor - mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

/** Legacy `isTemplateInstance`: a dashboard made from a template renders for a fixed object. */
const isTemplateInstance = computed(() => (props.draft.forcedContextObjectId ?? 0) !== 0)

/** An older server neither reports nor stores these flags; they must not look editable. */
const flagsSupported = computed(() => props.draft.objectContextFlagsSupported === true)
</script>

<template>
  <div class="dashboard-object-context-section">
    <fieldset class="form-fieldset">
      <legend>Object context</legend>
      <div class="form-fields">
        <div v-if="!isTemplateInstance" class="prop-inline">
          <Checkbox
            v-model="draft.showContextSelector"
            input-id="doc-context-selector"
            :binary="true"
            :disabled="!flagsSupported"
          />
          <label for="doc-context-selector" :class="{ 'label-disabled': !flagsSupported }">
            Show context selector in dashboard perspective
          </label>
        </div>
        <div class="prop-inline">
          <Checkbox
            v-model="draft.showAsObjectView"
            input-id="doc-object-view"
            :binary="true"
            :disabled="!flagsSupported"
          />
          <label for="doc-object-view" :class="{ 'label-disabled': !flagsSupported }">
            Automatically show this dashboard in object context
          </label>
        </div>
        <small v-if="!flagsSupported" class="prop-hint">
          This server does not report dashboard object-context flags yet.
        </small>
        <FormField label="Display priority (1-65535, 0 for automatic)" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="draft.displayPriority"
            :min="0"
            :max="65535"
            show-buttons
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.dashboard-object-context-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.label-disabled {
  color: var(--p-text-muted-color);
}

.prop-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
