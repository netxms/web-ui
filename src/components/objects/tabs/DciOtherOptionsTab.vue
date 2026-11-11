<script setup>
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import DetailCard from '@/components/layout/DetailCard.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { useDciFlags } from '@/composables/useDciFlags'
import FormField from '@/components/common/FormField.vue'
import {
  DCI_SYSTEM_TAGS,
  FEED_QUALIFIER_MAX_LENGTH,
  isKnownSystemTag,
  joinSystemTag,
  systemTagBase,
  systemTagQualifier,
} from '@/utils/dciSystemTags'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  form: { type: Object, required: true },
  dciType: { type: String, default: 'item' },
})

const flags = useDciFlags(props.form)

const CACHE_MODE_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'On' },
  { value: 2, label: 'Off' },
]

// The multiplier is a magnitude exponent (power of 1000/1024), not a raw scale factor.
const MULTIPLIER_DEGREE_OPTIONS = [
  { value: 5, label: 'Fixed to P' },
  { value: 4, label: 'Fixed to T' },
  { value: 3, label: 'Fixed to G' },
  { value: 2, label: 'Fixed to M' },
  { value: 1, label: 'Fixed to K' },
  { value: 0, label: 'Default' },
  { value: -1, label: 'Fixed to m' },
  { value: -2, label: 'Fixed to μ' },
  { value: -3, label: 'Fixed to n' },
  { value: -4, label: 'Fixed to p' },
  { value: -5, label: 'Fixed to f' },
]

// The base tag; a base outside the vocabulary is offered as itself so it survives a save, and
// "Other" clears the tag, qualifier included (legacy OtherOptions).
const baseTag = computed(() => systemTagBase(props.form.systemTag))
const interpretationOptions = computed(() => [
  { value: '', label: 'Other' },
  ...DCI_SYSTEM_TAGS.map(({ tag, label }) => ({ value: tag, label })),
  ...(baseTag.value && !isKnownSystemTag(baseTag.value)
    ? [{ value: baseTag.value, label: baseTag.value }]
    : []),
])

const interpretation = computed({
  get: () => baseTag.value,
  set: (tag) => {
    props.form.systemTag = joinSystemTag(tag ?? '', qualifierText.value)
  },
})

// Typed text is kept as typed; the stored tag gets it trimmed.
const qualifierText = ref(systemTagQualifier(props.form.systemTag))
watch(
  () => props.form.systemTag,
  (tag) => {
    const stored = systemTagQualifier(tag)
    if (stored !== qualifierText.value.trim()) qualifierText.value = stored
  },
)

function onQualifierInput(value) {
  qualifierText.value = value ?? ''
  props.form.systemTag = joinSystemTag(baseTag.value, qualifierText.value)
}

// The WebAPI does not expose the related object (absent from DCObject::toJson/updateFromJSON).
const relatedObjectPlaceholder = ref(0)
</script>

<template>
  <div class="other-options-tab">
    <div class="tab-cards-grid">
      <DetailCard title="Display">
        <div class="checkbox-row">
          <Checkbox v-model="flags.showOnObjectTooltip.value" input-id="oo-tooltip" binary />
          <label for="oo-tooltip"
            >Show last value in object tooltips and large labels on maps</label
          >
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="flags.showInObjectOverview.value" input-id="oo-overview" binary />
          <label for="oo-overview">Show last value in object overview</label>
        </div>
        <div v-if="dciType === 'item'" class="checkbox-row">
          <Checkbox v-model="flags.calculateNodeStatus.value" input-id="oo-status" binary />
          <label for="oo-status">Use this DCI for node status calculation</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="flags.hideOnLastValuesPage.value" input-id="oo-hide" binary />
          <label for="oo-hide">Hide in view mode</label>
        </div>
        <div v-if="dciType === 'item'" class="checkbox-row">
          <Checkbox v-model="flags.unsupportedAsError.value" input-id="oo-unsupported" binary />
          <label for="oo-unsupported">Interpret unsupported state as data collection error</label>
        </div>
      </DetailCard>

      <DetailCard title="Advanced">
        <FormField label="Agent Cache Mode" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="flags.cacheMode.value"
            :options="CACHE_MODE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="dciType === 'item'" label="Multiplier" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.multiplier"
            :options="MULTIPLIER_DEGREE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="dciType === 'item'" label="Interpretation" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="interpretation"
            :options="interpretationOptions"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="dciType === 'item'" label="Feed qualifier" v-slot="{ id }">
          <InputText
            :id="id"
            :model-value="qualifierText"
            :maxlength="FEED_QUALIFIER_MAX_LENGTH"
            :disabled="!interpretation"
            placeholder="e.g. A"
            class="form-input"
            @update:model-value="onQualifierInput"
          />
        </FormField>
        <UnderConstructionOverlay message="Not exposed by the WebAPI yet">
          <FormField label="Related Object" group>
            <ObjectPickerField
              v-model="relatedObjectPlaceholder"
              empty-label="(none)"
              class="form-input"
            />
          </FormField>
        </UnderConstructionOverlay>
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.other-options-tab {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.tab-cards-grid {
  columns: 2;
  column-gap: 1rem;
  padding: 1.5rem;
}

.tab-cards-grid :deep(.detail-card) {
  break-inside: avoid;
  margin-bottom: 1rem;
}

.tab-cards-grid :deep(.detail-card--wide) {
  column-span: all;
}

.form-field {
  display: flex;
  /* Overrides `column` from the global .form-field in forms.css. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

/* `:deep` reaches the FormField label; bare `label` covers hand-rolled markup. */
.form-field label,
.form-field :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}

.checkbox-row label {
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
