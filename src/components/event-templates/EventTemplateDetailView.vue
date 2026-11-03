<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Textarea from 'primevue/textarea'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import { useCreateEventTemplate, useUpdateEventTemplate } from '@/queries/useEventTemplateQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** null for create mode */
  template: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const SEVERITIES = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Warning' },
  { value: 2, label: 'Minor' },
  { value: 3, label: 'Major' },
  { value: 4, label: 'Critical' },
]

function buildForm(template) {
  return {
    name: template?.name ?? '',
    severity: template?.severity ?? 0,
    writeToLog: !!((template?.flags ?? 1) & 1),
    doNotMonitor: !!((template?.flags ?? 0) & 2),
    message: template?.message ?? '',
    tags: Array.isArray(template?.tags) ? template.tags.join(',') : (template?.tags ?? ''),
    description: template?.description ?? '',
  }
}

const form = ref(buildForm(props.template))

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.template)),
)

watch(
  () => props.template,
  (template) => {
    form.value = buildForm(template)
  },
)

const {
  mutate: createTemplate,
  isPending: isCreating,
  error: createError,
} = useCreateEventTemplate()
const {
  mutate: updateTemplate,
  isPending: isUpdating,
  error: updateError,
} = useUpdateEventTemplate()

const isNew = computed(() => props.template === null)
const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  const data = {
    name: form.value.name,
    severity: form.value.severity,
    flags: (form.value.writeToLog ? 1 : 0) | (form.value.doNotMonitor ? 2 : 0),
    message: form.value.message || undefined,
    tags: form.value.tags || undefined,
    description: form.value.description || undefined,
  }

  if (isNew.value) {
    createTemplate(data, {
      onSuccess: () => emit('close'),
    })
  } else {
    updateTemplate(
      { code: props.template.code, data },
      {
        onSuccess: () => emit('saved'),
      },
    )
  }
}

function discard() {
  form.value = buildForm(props.template)
  if (isNew.value) {
    emit('close')
  }
}

const title = computed(() =>
  isNew.value ? 'New Event Template' : (props.template?.name ?? 'Event Template'),
)
</script>

<template>
  <div class="event-template-detail">
    <EntityDetailHeader :title="title" subtitle="Event Template" @back="emit('close')">
      <template #actions>
        <Button
          label="Discard"
          icon="pi pi-times"
          severity="secondary"
          size="small"
          :disabled="!isDirty && !isNew"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          severity="primary"
          size="small"
          :disabled="!isDirty || isPending"
          :loading="isPending"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <div class="detail-content">
      <MutationErrorState :error="mutationError" class="error-message" />

      <div class="detail-cards-grid">
        <DetailCard v-if="!isNew" title="Identification">
          <FormField class="detail-field" label="Event code" v-slot="{ id }">
            <InputText :id="id" :model-value="String(template.code)" disabled class="field-input" />
          </FormField>
          <FormField class="detail-field" label="GUID" v-slot="{ id }">
            <InputText :id="id" :model-value="template.guid" disabled class="field-input" />
          </FormField>
        </DetailCard>

        <DetailCard title="General" :wide="isNew">
          <FormField class="detail-field" label="Name" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.name"
              placeholder="Event name (e.g. MY_CUSTOM_EVENT)"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Severity" v-slot="{ id }">
            <Select
              :input-id="id"
              id="template-severity"
              v-model="form.severity"
              :options="SEVERITIES"
              option-label="label"
              option-value="value"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Logging" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.writeToLog" input-id="template-write-log" />
              <label for="template-write-log" class="toggle-label">Write to event log</label>
            </div>
          </FormField>
          <FormField class="detail-field" label="Visibility" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.doNotMonitor" input-id="template-do-not-monitor" />
              <label for="template-do-not-monitor" class="toggle-label"
                >Hide from event monitor</label
              >
            </div>
          </FormField>
        </DetailCard>

        <DetailCard title="Content" :wide="true">
          <FormField class="detail-field" label="Message" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.message"
              placeholder="Message template (supports %1..%n macros)"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Tags" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.tags"
              placeholder="Comma-separated tags"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field detail-field-block" label="Description" v-slot="{ id }">
            <Textarea
              :id="id"
              v-model="form.description"
              placeholder="Detailed event description"
              rows="5"
              class="field-textarea"
              auto-resize
            />
          </FormField>
        </DetailCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-template-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.error-message {
  margin: 1.5rem 1.5rem 0;
}

.detail-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
}

.detail-field {
  display: flex;
  /* The global .form-field in forms.css is column; a scoped rule only overrides what it names. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field > label:first-child,
/* FormField renders the label, so it carries no scope id of this file. */
.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 10rem;
  flex-shrink: 0;
}

.detail-field-block {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding-top: 0.75rem;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-textarea {
  width: 100%;
  font-size: 0.875rem;
}

.toggle-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
