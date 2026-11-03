<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Message from 'primevue/message'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import JsonEditor from '@/components/common/JsonEditor.vue'
import {
  useEventForwarderDrivers,
  useCreateEventForwarder,
  useUpdateEventForwarder,
  useRenameEventForwarder,
} from '@/queries/useEventForwarderQueries'
import {
  eventForwarderStatus,
  sendStatusLabel,
  driverConfigHint,
  parseConfiguration,
  formatConfiguration,
  NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from '@/utils/eventForwarderDisplay'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** null to create a new one. */
  forwarder: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved', 'created'])

const isNew = computed(() => props.forwarder === null)

function buildForm(forwarder) {
  return {
    name: forwarder?.name ?? '',
    description: forwarder?.description ?? '',
    driverName: forwarder?.driverName ?? null,
    configuration: formatConfiguration(forwarder?.configuration),
  }
}

const form = ref(buildForm(props.forwarder))
/** Cleared once the operator types their own name, so the driver stops overwriting it. */
const nameFollowsDriver = ref(isNew.value)

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.forwarder)),
)

watch(
  () => props.forwarder,
  (forwarder) => {
    form.value = buildForm(forwarder)
    nameFollowsDriver.value = false
  },
)

const { data: driversData } = useEventForwarderDrivers()
const driverOptions = computed(() => (driversData.value ?? []).map((d) => ({ label: d, value: d })))

// Seeds the name until the operator types their own, like the chat bot create flow.
function onDriverChange() {
  if (nameFollowsDriver.value) form.value.name = form.value.driverName ?? ''
}

function onNameInput() {
  nameFollowsDriver.value = false
}

const configEditor = ref()
const isConfigValid = ref(true)

const configHint = computed(() => driverConfigHint(form.value.driverName))

const status = computed(() => eventForwarderStatus(props.forwarder))
const lastMessage = computed(() => formatAgeCompact(props.forwarder?.lastMessageTime))

const { mutate: createForwarder, isPending: isCreating } = useCreateEventForwarder()
const { mutate: updateForwarder, isPending: isUpdating } = useUpdateEventForwarder()
const { mutate: renameForwarder, isPending: isRenaming } = useRenameEventForwarder()

const isPending = computed(() => isCreating.value || isUpdating.value || isRenaming.value)
const saveError = ref(null)
const nameError = ref(false)
const driverError = ref(false)

const canSave = computed(() => isDirty.value && isConfigValid.value && !isPending.value)

function validate() {
  nameError.value = !form.value.name.trim()
  driverError.value = !form.value.driverName
  return !nameError.value && !driverError.value
}

function save() {
  saveError.value = null
  if (!validate()) return

  const config = parseConfiguration(form.value.configuration)
  if (!config.ok) {
    saveError.value = `Driver configuration is not valid JSON: ${config.error}`
    return
  }

  const name = form.value.name.trim()
  const payload = {
    description: form.value.description.trim(),
    driverName: form.value.driverName,
    configuration: config.value,
  }

  if (isNew.value) {
    createForwarder(
      { name, ...payload },
      {
        onSuccess: () => emit('created', name),
        onError: (err) => {
          saveError.value =
            err.status === 409
              ? `An event forwarder named "${name}" already exists.`
              : (err.message ?? 'Failed to create event forwarder.')
        },
      },
    )
    return
  }

  const originalName = props.forwarder.name

  const doRename = () => {
    renameForwarder(
      { name: originalName, newName: name },
      {
        onSuccess: () => emit('saved', name),
        onError: (err) => {
          saveError.value =
            err.status === 409
              ? `An event forwarder named "${name}" already exists.`
              : (err.message ?? 'Failed to rename event forwarder.')
        },
      },
    )
  }

  // Rename last: it invalidates the query keyed by the old name, dropping anything after it.
  updateForwarder(
    { name: originalName, data: payload },
    {
      onSuccess: () => {
        if (name === originalName) emit('saved', originalName)
        else doRename()
      },
      onError: (err) => {
        saveError.value = err.message ?? 'Failed to update event forwarder.'
      },
    },
  )
}

function discard() {
  saveError.value = null
  nameError.value = false
  driverError.value = false
  form.value = buildForm(props.forwarder)
  if (isNew.value) {
    nameFollowsDriver.value = true
    emit('close')
  }
}

const title = computed(() =>
  isNew.value ? 'New Event Forwarder' : (props.forwarder?.name ?? 'Event Forwarder'),
)
</script>

<template>
  <div class="event-forwarder-detail">
    <EntityDetailHeader :title="title" subtitle="Event Forwarder" @back="emit('close')">
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
          :disabled="!canSave"
          :loading="isPending"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <div class="detail-cards-grid">
      <MutationErrorState :error="saveError" class="grid-message" />

      <DetailCard title="General">
        <FormField
          class="detail-field"
          :class="{ 'field-error': driverError }"
          label="Driver"
          v-slot="{ id }"
        >
          <Select
            :input-id="id"
            id="fwd-driver"
            v-model="form.driverName"
            :options="driverOptions"
            option-label="label"
            option-value="value"
            placeholder="Select driver"
            class="field-input"
            @change="onDriverChange"
          />
        </FormField>
        <FormField
          class="detail-field"
          :class="{ 'field-error': nameError }"
          label="Name"
          v-slot="{ id }"
        >
          <InputText
            :id="id"
            v-model="form.name"
            :maxlength="NAME_MAX_LENGTH"
            placeholder="Event forwarder name"
            class="field-input"
            @input="onNameInput"
          />
        </FormField>
        <FormField class="detail-field" label="Description" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.description"
            :maxlength="DESCRIPTION_MAX_LENGTH"
            placeholder="Optional description"
            class="field-input"
          />
        </FormField>
      </DetailCard>

      <DetailCard v-if="!isNew" title="Status">
        <FormField class="detail-field" label="Driver" group>
          <span class="status-badge" :class="status.class">
            <i :class="status.icon" />
            {{ status.label }}
          </span>
        </FormField>
        <FormField class="detail-field" label="Last delivery" group>
          <span class="field-value">{{ sendStatusLabel(forwarder.sendStatus) }}</span>
        </FormField>
        <FormField class="detail-field" label="Events forwarded" group>
          <span class="field-value">{{ forwarder.messageCount ?? 0 }}</span>
        </FormField>
        <FormField class="detail-field" label="Failures / dropped" group>
          <span class="field-value">
            {{ forwarder.failureCount ?? 0 }} / {{ forwarder.droppedCount ?? 0 }}
          </span>
        </FormField>
        <FormField class="detail-field" label="Queue size" group>
          <span class="field-value">{{ forwarder.queueSize ?? 0 }}</span>
        </FormField>
        <FormField class="detail-field" label="Last forwarded event" group>
          <span v-tooltip.top="formatDateTime(forwarder.lastMessageTime)" class="field-value">
            {{ lastMessage || 'Never' }}
          </span>
        </FormField>
        <FormField
          v-if="forwarder.errorMessage"
          class="detail-field detail-field--top"
          label="Last error"
          group
        >
          <Message severity="error" :closable="false" class="inline-message">
            {{ forwarder.errorMessage }}
          </Message>
        </FormField>
      </DetailCard>

      <DetailCard title="Driver Configuration" wide>
        <div class="detail-field detail-field-block">
          <div class="config-toolbar">
            <span class="config-title">Configuration (JSON)</span>
            <Button
              label="Format"
              icon="pi pi-align-left"
              size="small"
              severity="secondary"
              text
              :disabled="!isConfigValid"
              @click="configEditor?.format()"
            />
          </div>
          <JsonEditor
            ref="configEditor"
            v-model="form.configuration"
            placeholder="{}"
            height="20rem"
            @valid="isConfigValid = $event"
          />
          <small class="hint-text">
            <template v-if="configHint">
              Known keys for <code>{{ form.driverName }}</code
              >: {{ configHint.join(', ') }}.
            </template>
            <template v-else-if="form.driverName">
              Driver-specific settings as a JSON object. This driver is supplied by a server module,
              so its keys are documented with the module.
            </template>
            <template v-else> Select a driver to see its known configuration keys. </template>
          </small>
        </div>
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.event-forwarder-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-cards-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

.grid-message {
  grid-column: 1 / -1;
  margin: 0;
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
  align-items: stretch;
  gap: 0.5rem;
  padding-top: 0.75rem;
}

/* Label stays on the left while a multi-line value grows downwards. */
.detail-field--top {
  align-items: flex-start;
}

.detail-field--top > label:first-child {
  padding-top: 0.4375rem;
}

.field-input {
  flex: 1;
  min-width: 0;
}

:deep(.field-input input) {
  max-width: 100%;
}

.field-value {
  font-size: 0.875rem;
}

.field-error :deep(.p-inputtext),
.field-error :deep(.p-select) {
  border-color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.hint-text code {
  font-family: var(--font-mono);
}

.inline-message {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.config-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.config-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
}

.status-ok {
  color: var(--p-green-600);
}

.status-warn {
  color: var(--p-orange-600);
}

.status-error {
  color: var(--p-red-500);
}
</style>
