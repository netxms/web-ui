<script setup>
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import DetailCard from '@/components/layout/DetailCard.vue'
import FormField from '@/components/common/FormField.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
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

// Interpretation is the system tag. A base outside the vocabulary is offered as itself so it
// survives a save, and "Other" clears the tag, qualifier included (legacy OtherOptions).
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

// Servers before netxms 9fbb9d16d6 neither send nor store `relatedObject`.
const relatedObjectSupported = computed(() => 'relatedObject' in props.form)
const relatedObjectPlaceholder = ref(0)
</script>

<template>
  <div class="classification-tab">
    <div class="tab-cards-grid">
      <DetailCard title="Meaning">
        <template v-if="dciType === 'item'">
          <FormField label="Interpretation" v-slot="{ id }">
            <!-- The placeholder is what "Other" shows as: Select treats '' as no selection. -->
            <Select
              :input-id="id"
              v-model="interpretation"
              :options="interpretationOptions"
              option-label="label"
              option-value="value"
              placeholder="Other"
              class="form-input"
            />
          </FormField>
          <FormField label="Feed qualifier" v-slot="{ id }">
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
        </template>
        <FormField v-if="relatedObjectSupported" label="Related Object" group>
          <ObjectPickerField v-model="form.relatedObject" empty-label="(none)" class="form-input" />
        </FormField>
        <UnderConstructionOverlay v-else message="Needs a newer server version">
          <FormField label="Related Object" group>
            <ObjectPickerField
              v-model="relatedObjectPlaceholder"
              empty-label="(none)"
              class="form-input"
            />
          </FormField>
        </UnderConstructionOverlay>
      </DetailCard>

      <DetailCard title="Tags">
        <FormField label="User Tag" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.userTag"
            class="form-input"
            placeholder="Optional user tag"
          />
        </FormField>
        <FormField label="AI Hint" class="form-field--top" v-slot="{ id }">
          <Textarea
            :id="id"
            v-model="form.aiHint"
            auto-resize
            rows="2"
            class="form-input"
            placeholder="Optional context hint for AI analysis"
          />
        </FormField>
      </DetailCard>

      <DetailCard title="Comments" :wide="true">
        <Textarea
          v-model="form.comments"
          auto-resize
          rows="4"
          class="comments-input"
          placeholder="Notes about this data collection item..."
        />
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.classification-tab {
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

/* The cards above end their columns, where their bottom margin is dropped at the break. */
.tab-cards-grid :deep(.detail-card--wide) {
  column-span: all;
  margin-top: 1rem;
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

.form-field--top {
  align-items: flex-start;
  padding-top: 0.5rem;
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

.comments-input {
  width: 100%;
  resize: none;
  margin: 0.5rem 0 0.25rem;
}
</style>
