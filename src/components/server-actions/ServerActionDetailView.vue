<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import MacroTextareaField from '@/components/common/MacroTextareaField.vue'
import MacroInputField from '@/components/common/MacroInputField.vue'
import { GLOBAL_MACROS } from '@/utils/macroDefinitions'
import { useCreateServerAction, useUpdateServerAction } from '@/queries/useServerActionQueries'
import { useNotificationChannels } from '@/queries/useNotificationChannelQueries'
import { useEventForwarders } from '@/queries/useEventForwarderQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** null for create mode */
  action: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const ACTION_TYPES = [
  { value: 0, label: 'Execute command on management server' },
  { value: 1, label: 'Execute command on remote node via agent' },
  { value: 7, label: 'Execute command on remote node via SSH' },
  { value: 5, label: 'Execute NXSL script' },
  { value: 3, label: 'Send notification' },
  { value: 4, label: 'Forward event to other NetXMS server' },
]

/**
 * Labels set to null hide their field. channelSource is 'channels' or 'forwarders'; the server
 * stores both in `channelName`. fieldsFromChannel: recipient and subject follow channelFields.
 */
const TYPE_FIELD_CONFIG = {
  0: {
    dynamicLabel: null,
    dynamicField: null,
    textareaLabel: 'Command',
    showChannel: false,
    showSubject: false,
  },
  1: {
    dynamicLabel: 'Remote host',
    dynamicField: 'recipientAddress',
    textareaLabel: "Agent's action",
    showChannel: false,
    showSubject: false,
  },
  7: {
    dynamicLabel: 'Remote host',
    dynamicField: 'recipientAddress',
    textareaLabel: 'Command',
    showChannel: false,
    showSubject: false,
  },
  5: {
    dynamicLabel: 'Script name',
    dynamicField: 'data',
    textareaLabel: null,
    showChannel: false,
    showSubject: false,
  },
  3: {
    dynamicLabel: "Recipient's address",
    dynamicField: 'recipientAddress',
    textareaLabel: 'Message text',
    showChannel: true,
    channelSource: 'channels',
    showSubject: true,
    fieldsFromChannel: true,
  },
  4: {
    dynamicLabel: 'Recipient',
    dynamicField: 'recipientAddress',
    textareaLabel: null,
    showChannel: true,
    channelSource: 'forwarders',
    showSubject: false,
  },
}

const { data: channelsData } = useNotificationChannels()
const notificationChannels = computed(() => channelsData.value ?? [])

const { data: forwardersData } = useEventForwarders()
const eventForwarders = computed(() => forwardersData.value ?? [])

function buildForm(action) {
  return {
    name: action?.name ?? '',
    type: action?.type ?? 0,
    isDisabled: action?.isDisabled ?? false,
    data: action?.data ?? '',
    recipientAddress: action?.recipientAddress ?? '',
    emailSubject: action?.emailSubject ?? '',
    notificationChannelName: action?.notificationChannelName ?? '',
  }
}

const form = ref(buildForm(props.action))

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.action)),
)

watch(
  () => props.action,
  (action) => {
    form.value = buildForm(action)
  },
)

const typeConfig = computed(() => TYPE_FIELD_CONFIG[form.value.type] ?? TYPE_FIELD_CONFIG[0])

const isForwarderChannel = computed(() => typeConfig.value.channelSource === 'forwarders')

const channelOptions = computed(() =>
  isForwarderChannel.value ? eventForwarders.value : notificationChannels.value,
)

const channelLabel = computed(() => (isForwarderChannel.value ? 'Event forwarder' : 'Channel name'))

const channelPlaceholder = computed(() =>
  isForwarderChannel.value ? 'Select event forwarder...' : 'Select channel...',
)

/**
 * Recipient and subject per the channel's driver, as in the legacy client. A stored channel
 * missing from the list shows both, so a stored value is never hidden; hidden fields keep
 * their value.
 */
const channelFields = computed(() => {
  const name = form.value.notificationChannelName
  if (!name) return { recipient: false, subject: false }
  const channel = notificationChannels.value.find((c) => c.name === name)
  if (!channel) return { recipient: true, subject: true }
  return { recipient: !!channel.needRecipient, subject: !!channel.needSubject }
})

const showDynamicField = computed(
  () =>
    !!typeConfig.value.dynamicLabel &&
    (!typeConfig.value.fieldsFromChannel || channelFields.value.recipient),
)

const showSubject = computed(
  () =>
    typeConfig.value.showSubject &&
    (!typeConfig.value.fieldsFromChannel || channelFields.value.subject),
)

const { mutate: createAction, isPending: isCreating, error: createError } = useCreateServerAction()
const { mutate: updateAction, isPending: isUpdating, error: updateError } = useUpdateServerAction()

const isNew = computed(() => props.action === null)
const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  const data = {
    name: form.value.name,
    type: form.value.type,
    isDisabled: form.value.isDisabled,
    data: form.value.data || undefined,
    recipientAddress: form.value.recipientAddress || undefined,
    emailSubject: form.value.emailSubject || undefined,
    notificationChannelName: form.value.notificationChannelName || undefined,
  }

  if (isNew.value) {
    createAction(data, {
      onSuccess: () => emit('close'),
    })
  } else {
    updateAction(
      { id: props.action.id, data },
      {
        onSuccess: () => emit('saved'),
      },
    )
  }
}

function discard() {
  form.value = buildForm(props.action)
  if (isNew.value) {
    emit('close')
  }
}

const title = computed(() => (isNew.value ? 'New Action' : (props.action?.name ?? 'Action')))
</script>

<template>
  <div class="server-action-detail">
    <EntityDetailHeader :title="title" subtitle="Server Action" @back="emit('close')">
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
        <DetailCard title="General" :wide="!typeConfig.dynamicLabel && !typeConfig.showChannel">
          <FormField class="detail-field" label="Name" v-slot="{ id }">
            <InputText :id="id" v-model="form.name" placeholder="Action name" class="field-input" />
          </FormField>
          <FormField class="detail-field" label="Type" v-slot="{ id }">
            <Select
              :input-id="id"
              id="action-type"
              v-model="form.type"
              :options="ACTION_TYPES"
              option-label="label"
              option-value="value"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Options" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.isDisabled" input-id="action-disabled" />
              <label for="action-disabled" class="toggle-label">Action is disabled</label>
            </div>
          </FormField>
        </DetailCard>

        <DetailCard v-if="typeConfig.dynamicLabel || typeConfig.showChannel" title="Destination">
          <FormField
            v-if="typeConfig.showChannel"
            class="detail-field"
            :label="`${channelLabel}`"
            v-slot="{ id }"
          >
            <Select
              :input-id="id"
              id="action-channel"
              v-model="form.notificationChannelName"
              :options="channelOptions"
              option-label="name"
              option-value="name"
              show-clear
              :placeholder="channelPlaceholder"
              class="field-input"
            />
          </FormField>
          <FormField
            v-if="showDynamicField"
            class="detail-field"
            :label="`${typeConfig.dynamicLabel}`"
            v-slot="{ id }"
          >
            <InputText
              :id="id"
              v-model="form[typeConfig.dynamicField]"
              :placeholder="typeConfig.dynamicLabel"
              class="field-input"
            />
          </FormField>
          <FormField v-if="showSubject" class="detail-field" label="Subject" group>
            <MacroInputField
              id="action-subject"
              v-model="form.emailSubject"
              :macros="GLOBAL_MACROS"
              placeholder="Subject (supports macros)"
              class="field-input"
            />
          </FormField>
        </DetailCard>

        <DetailCard v-if="typeConfig.textareaLabel" :title="typeConfig.textareaLabel" :wide="true">
          <div class="detail-field detail-field-block">
            <MacroTextareaField
              v-model="form.data"
              :macros="GLOBAL_MACROS"
              :placeholder="typeConfig.textareaLabel"
              :rows="6"
              class="field-textarea"
            />
          </div>
        </DetailCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.server-action-detail {
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
  /* The global .form-field in forms.css is column. */
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
/* FormField's own label carries its scope id, not this file's. */
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
  font-family: var(--font-mono);
  font-size: 0.8125rem;
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
