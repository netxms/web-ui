<script setup>
import { computed } from 'vue'
import FormField from '@/components/common/FormField.vue'
import InputText from 'primevue/inputtext'
import CategoryPickerButton from '@/components/object-categories/CategoryPickerButton.vue'
import MarkdownCommentEditor from '@/components/common/MarkdownCommentEditor.vue'
import { isCreatedManually, isValidMacAddress } from '@/utils/interfaceDisplay'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

// An interface's MAC address. The server takes a new one only for a manually created
// interface (legacy "Change MAC address..."); a discovered one reads it from the device.
const isInterface = computed(() => props.object.class === 'Interface')
const macEditable = computed(() => isCreatedManually(props.object))
const macHint = computed(() =>
  macEditable.value ? '' : 'Read from the device; only a manually created interface can change it.',
)
// Judged only once edited: an untouched value is whatever the server holds.
const macError = computed(() =>
  macEditable.value &&
  props.draft.macAddress !== props.object.macAddress &&
  !isValidMacAddress(props.draft.macAddress)
    ? 'Six hex octets separated by colons or hyphens, e.g. 00:1A:2B:3C:4D:5E'
    : '',
)
</script>

<template>
  <div class="general-section">
    <fieldset class="form-fieldset">
      <legend>Identification</legend>
      <div class="form-grid">
        <FormField label="Object ID" group>
          <div class="form-value readonly">{{ object.id }}</div>
        </FormField>
        <FormField label="Class" group>
          <div class="form-value readonly">{{ object.class }}</div>
        </FormField>
        <FormField v-if="object.guid" label="GUID" group class="full-width">
          <div class="form-value readonly monospace">{{ object.guid }}</div>
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Properties</legend>
      <div class="form-grid">
        <div class="form-field full-width">
          <label class="form-label" for="prop-name">Name</label>
          <InputText id="prop-name" v-model="draft.name" class="form-input" />
        </div>
        <div class="form-field full-width">
          <label class="form-label" for="prop-alias">Alias</label>
          <InputText id="prop-alias" v-model="draft.alias" class="form-input" />
        </div>
        <FormField label="Category" group class="full-width">
          <CategoryPickerButton v-model="draft.category" />
        </FormField>
        <FormField
          v-if="isInterface"
          label="MAC address"
          class="full-width"
          :hint="macHint"
          :error="macError"
          v-slot="{ id, describedBy }"
        >
          <InputText
            :id="id"
            v-model="draft.macAddress"
            :disabled="!macEditable"
            :aria-describedby="describedBy"
            class="form-input monospace"
          />
        </FormField>
      </div>
    </fieldset>

    <!-- Edits the raw macro source; objectToApiPayload adds the markdown prefix back -->
    <fieldset class="form-fieldset">
      <legend>Comments</legend>
      <MarkdownCommentEditor v-model="draft.commentsSource" :rows="6" />
    </fieldset>
  </div>
</template>

<style scoped>
.general-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-value {
  font-size: 0.875rem;
  padding: 0.375rem 0;
}

.form-value.readonly {
  color: var(--p-text-secondary-color);
}

.monospace {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}
</style>
