<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import AiOperatorChecksCard from './AiOperatorChecksCard.vue'
import AiOperatorInstructionsCard from './AiOperatorInstructionsCard.vue'
import {
  useCreateAiOperator,
  useUpdateAiOperator,
  useResetAiOperator,
} from '@/queries/useAiOperatorQueries'
import { useUsers } from '@/queries/useUserQueries'
import { labelForRight } from '@/auth/systemRights'
import { KNOWN_PROVIDER_SLOTS } from '@/utils/chatBotDisplay'
import {
  aiOperatorState,
  buildAiOperatorPayload,
  formatTokenBudget,
  validateAiOperator,
  NAME_MAX_LENGTH,
  MODEL_SLOT_MAX_LENGTH,
  INTERVAL_MIN,
  INTERVAL_MAX,
  RETENTION_DAYS_MAX,
  MAX_RECORDS_MAX,
  DEFAULT_MIN_INTERVAL,
  DEFAULT_MAX_INTERVAL,
} from '@/utils/aiOperatorDisplay'
import { formatDurationCompact, formatAgeCompact, formatDateTime } from '@/utils/timeFormat'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** AI operator instance to edit, or null to create a new one. */
  operator: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved', 'created'])

const confirm = useConfirm()
const toast = useToast()

const isNew = computed(() => props.operator === null)

function buildForm(operator) {
  return {
    name: operator?.name ?? '',
    description: operator?.description ?? '',
    // 0 = the server's default, the built-in "ai-operator" account (new instances only)
    ownerUserId: operator?.ownerUserId ?? 0,
    enabled: operator?.enabled ?? true,
    scopeFilter: operator?.scopeFilter ?? '',
    modelSlot: operator?.modelSlot ?? '',
    minInterval: operator?.minInterval || DEFAULT_MIN_INTERVAL,
    maxInterval: operator?.maxInterval || DEFAULT_MAX_INTERVAL,
    dailyTokenBudget: operator?.dailyTokenBudget ?? 0,
    personaPrompt: operator?.personaPrompt ?? '',
    observationRetentionDays: operator?.observationRetentionDays ?? 0,
    observationMaxRecords: operator?.observationMaxRecords ?? 0,
    instructions: operator?.instructions ?? '',
    instructionsLocked: operator?.instructionsLocked ?? false,
  }
}

const form = ref(buildForm(props.operator))

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.operator)),
)

watch(
  () => props.operator,
  (operator) => {
    form.value = buildForm(operator)
    errors.value = {}
  },
)

// The instance runs with its owner's rights. The server checks the owner (an enabled user with
// the AI assistant right) and names the rule it breaks; the right is not checked here because
// systemRights arrives as a JSON number that cannot carry 64 bits exactly. Without "Manage
// users" the select keeps the current owner, disabled.

const { data: usersData, error: usersError, isLoading: isLoadingUsers } = useUsers()
const usersRefused = computed(() => !!usersError.value)

function ownerLabel(id) {
  const user = (usersData.value ?? []).find((u) => u.id === id)
  if (!user) return `[${id}]`
  return user.flags?.disabled ? `${user.name} (disabled)` : user.name
}

const ownerOptions = computed(() => {
  const options = isNew.value ? [{ value: 0, label: 'Default (ai-operator account)' }] : []
  const users = (usersData.value ?? [])
    .filter((u) => u.id !== 0 && !u.flags?.disabled)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  for (const user of users) options.push({ value: user.id, label: user.name })
  // The current owner stays selectable when it is disabled, deleted or cannot be listed.
  const id = form.value.ownerUserId
  if (id && !options.some((option) => option.value === id)) {
    options.push({ value: id, label: ownerLabel(id) })
  }
  return options
})

const ownerHint = computed(() => {
  if (usersError.value?.status === 403) {
    return `Choosing an owner requires the "${labelForRight('manageUsers')}" system right.`
  }
  if (usersRefused.value) return 'Users could not be loaded.'
  return `Runs with this account's rights. It needs the "${labelForRight('useAiAssistant')}" right.`
})

const state = computed(() => aiOperatorState(props.operator))

const { mutate: createOperator, isPending: isCreating } = useCreateAiOperator()
const { mutate: updateOperator, isPending: isUpdating } = useUpdateAiOperator()
const { mutate: resetOperator, isPending: isResetting } = useResetAiOperator()

const isPending = computed(() => isCreating.value || isUpdating.value)
const saveError = ref(null)
const errors = ref({})

function save() {
  saveError.value = null
  errors.value = validateAiOperator(form.value)
  if (Object.keys(errors.value).length > 0) return

  const payload = buildAiOperatorPayload(form.value, props.operator)

  // A refused owner is a 400 too, with its own reason ("Invalid owner: ...").
  const onError = (err) => {
    saveError.value =
      err.status === 400 && !err.message?.startsWith('Invalid owner')
        ? 'Invalid configuration - check intervals and budget.'
        : (err.message ?? 'Failed to save AI operator.')
  }

  if (isNew.value) {
    createOperator(payload, {
      onSuccess: (created) => emit('created', created?.id),
      onError,
    })
    return
  }

  updateOperator(
    { operatorId: props.operator.id, data: payload },
    { onSuccess: () => emit('saved'), onError },
  )
}

function discard() {
  saveError.value = null
  errors.value = {}
  form.value = buildForm(props.operator)
  if (isNew.value) emit('close')
}

function confirmReset() {
  confirm.require({
    message:
      'Accumulated state (memento, current focus, watch list, and iteration counter) will be cleared. The next execution starts from a clean slate. Are you sure?',
    header: 'Confirm Reset',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Reset',
    accept: () => {
      resetOperator(props.operator.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Reset',
            detail: 'Accumulated state cleared.',
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Reset Failed',
            detail: err.message ?? 'Failed to reset AI operator state.',
            life: 5000,
          })
        },
      })
    },
  })
}

const title = computed(() =>
  isNew.value ? 'New AI Operator' : (props.operator?.name ?? 'AI Operator'),
)
</script>

<template>
  <div class="ai-operator-detail">
    <EntityDetailHeader :title="title" subtitle="AI Operator" @back="emit('close')">
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

    <div class="detail-cards-grid">
      <MutationErrorState :error="saveError" class="grid-message" />

      <DetailCard title="General">
        <FormField class="detail-field" :class="{ 'field-error': errors.name }" label="Name" group>
          <div class="field-input field-with-hint">
            <InputText
              id="op-name"
              v-model="form.name"
              :maxlength="NAME_MAX_LENGTH"
              placeholder="Instance name"
              class="w-full"
            />
            <small v-if="errors.name" class="error-text">{{ errors.name }}</small>
          </div>
        </FormField>
        <FormField class="detail-field" label="Description" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.description"
            placeholder="Optional description"
            class="field-input"
          />
        </FormField>
        <FormField class="detail-field" label="Owner" v-slot="{ id }">
          <div class="field-input field-with-hint">
            <Select
              v-model="form.ownerUserId"
              :input-id="id"
              :options="ownerOptions"
              option-label="label"
              option-value="value"
              :loading="isLoadingUsers"
              :disabled="usersRefused"
              filter
              class="w-full"
            />
            <small class="hint-text">{{ ownerHint }}</small>
          </div>
        </FormField>
        <FormField class="detail-field" label="State" group>
          <div class="toggle-field">
            <ToggleSwitch v-model="form.enabled" input-id="op-enabled" />
            <label for="op-enabled" class="toggle-label">Instance is enabled</label>
          </div>
        </FormField>
        <FormField class="detail-field" label="Model slot" group>
          <div class="field-input field-with-hint">
            <InputText
              id="op-model-slot"
              v-model="form.modelSlot"
              :maxlength="MODEL_SLOT_MAX_LENGTH"
              placeholder="Default slot"
              class="w-full"
            />
            <small class="hint-text">
              Leave empty for the default slot. Known slots: {{ KNOWN_PROVIDER_SLOTS.join(', ') }}.
            </small>
          </div>
        </FormField>
        <FormField class="detail-field" label="Scope filter" group>
          <div class="field-input field-with-hint">
            <InputText
              id="op-scope"
              v-model="form.scopeFilter"
              placeholder="All accessible objects"
              class="w-full"
            />
            <small class="hint-text">
              Object names or IDs. Leave empty for all accessible objects.
            </small>
          </div>
        </FormField>
      </DetailCard>

      <DetailCard title="Schedule &amp; Budget">
        <FormField
          class="detail-field"
          :class="{ 'field-error': errors.minInterval }"
          label="Minimum interval"
          group
        >
          <div class="field-input field-with-hint">
            <InputNumber
              id="op-min-interval"
              v-model="form.minInterval"
              :min="INTERVAL_MIN"
              :max="INTERVAL_MAX"
              suffix=" s"
              show-buttons
              :step="60"
              class="number-input"
            />
            <small v-if="errors.minInterval" class="error-text">{{ errors.minInterval }}</small>
            <small v-else class="hint-text"
              >At least {{ formatDurationCompact(form.minInterval) }} between executions</small
            >
          </div>
        </FormField>
        <FormField
          class="detail-field"
          :class="{ 'field-error': errors.maxInterval }"
          label="Maximum interval"
          group
        >
          <div class="field-input field-with-hint">
            <InputNumber
              id="op-max-interval"
              v-model="form.maxInterval"
              :min="INTERVAL_MIN"
              :max="INTERVAL_MAX"
              suffix=" s"
              show-buttons
              :step="60"
              class="number-input"
            />
            <small v-if="errors.maxInterval" class="error-text">{{ errors.maxInterval }}</small>
            <small v-else class="hint-text"
              >At most {{ formatDurationCompact(form.maxInterval) }} between executions</small
            >
          </div>
        </FormField>
        <FormField class="detail-field" label="Daily token budget" group>
          <div class="field-input field-with-hint">
            <InputNumber
              id="op-budget"
              v-model="form.dailyTokenBudget"
              :min="0"
              :max="1000000000"
              :step="1000"
              show-buttons
              class="number-input"
            />
            <small class="hint-text">0 = unlimited.</small>
          </div>
        </FormField>
      </DetailCard>

      <DetailCard title="Observations">
        <FormField class="detail-field" label="Retention" group>
          <div class="field-input field-with-hint">
            <InputNumber
              id="op-retention"
              v-model="form.observationRetentionDays"
              :min="0"
              :max="RETENTION_DAYS_MAX"
              suffix=" days"
              show-buttons
              class="number-input"
            />
            <small class="hint-text">0 = server default.</small>
          </div>
        </FormField>
        <FormField class="detail-field" label="Record limit" group>
          <div class="field-input field-with-hint">
            <InputNumber
              id="op-max-records"
              v-model="form.observationMaxRecords"
              :min="0"
              :max="MAX_RECORDS_MAX"
              :step="100"
              show-buttons
              class="number-input"
            />
            <small class="hint-text">0 = server default.</small>
          </div>
        </FormField>
      </DetailCard>

      <DetailCard title="Persona" wide>
        <div class="detail-field detail-field-block">
          <Textarea
            v-model="form.personaPrompt"
            :rows="8"
            placeholder="Additional instructions appended to the operator's system prompt..."
            class="persona-area"
          />
          <small class="hint-text">
            Free-form instructions that shape how this operator reasons. Appended to the system
            prompt on every iteration.
          </small>
        </div>
      </DetailCard>

      <AiOperatorInstructionsCard
        v-if="!isNew"
        v-model:instructions="form.instructions"
        v-model:locked="form.instructionsLocked"
        :operator-id="operator.id"
      />

      <!-- Saves on its own, outside this view's Save / Discard, as in legacy. -->
      <AiOperatorChecksCard v-if="!isNew" :operator="operator" />

      <DetailCard v-if="!isNew" title="Runtime State" wide>
        <div class="runtime-grid">
          <FormField class="detail-field" label="State" group>
            <span class="status-badge" :class="state.class">
              <i :class="state.icon" />
              {{ state.label }}
            </span>
          </FormField>
          <FormField class="detail-field" label="Iteration" group>
            <span class="field-value">{{ operator.iteration ?? 0 }}</span>
          </FormField>
          <FormField class="detail-field" label="Consecutive failures" group>
            <span
              class="field-value"
              :class="{ 'text-danger': (operator.consecutiveFailures ?? 0) > 0 }"
              >{{ operator.consecutiveFailures ?? 0 }}</span
            >
          </FormField>
          <FormField class="detail-field" label="Tokens used today" group>
            <span class="field-value">
              {{ (operator.tokensUsedToday ?? 0).toLocaleString() }} /
              {{ formatTokenBudget(operator.dailyTokenBudget) }}
            </span>
          </FormField>
          <FormField class="detail-field" label="Last execution" group>
            <span v-tooltip.top="formatDateTime(operator.lastExecutionTime)" class="field-value">
              {{ formatAgeCompact(operator.lastExecutionTime) || 'Never' }}
            </span>
          </FormField>
          <FormField class="detail-field" label="Next execution" group>
            <span class="field-value">{{
              formatDateTime(operator.nextExecutionTime) || 'Not scheduled'
            }}</span>
          </FormField>
          <FormField class="detail-field" label="Created" group>
            <span class="field-value">{{ formatDateTime(operator.created) || '—' }}</span>
          </FormField>
          <FormField class="detail-field" label="Modified" group>
            <span class="field-value">{{ formatDateTime(operator.modified) || '—' }}</span>
          </FormField>
        </div>

        <div class="detail-field detail-field-block">
          <span class="block-label">Current focus</span>
          <p class="state-text" :class="{ 'text-muted': !operator.currentFocus }">
            {{ operator.currentFocus || 'Not set' }}
          </p>
        </div>
        <div class="detail-field detail-field-block">
          <span class="block-label">Watch list</span>
          <p class="state-text" :class="{ 'text-muted': !operator.watchList }">
            {{ operator.watchList || 'Empty' }}
          </p>
        </div>
        <div class="detail-field detail-field-block">
          <span class="block-label">Memento</span>
          <p class="state-text state-text--mono" :class="{ 'text-muted': !operator.memento }">
            {{ operator.memento || 'Empty' }}
          </p>
        </div>
        <div class="detail-field detail-field-block">
          <span class="block-label">Last explanation</span>
          <p class="state-text" :class="{ 'text-muted': !operator.lastExplanation }">
            {{ operator.lastExplanation || 'None' }}
          </p>
        </div>

        <div class="runtime-actions">
          <Button
            label="Reset accumulated state"
            icon="pi pi-replay"
            size="small"
            severity="danger"
            outlined
            :loading="isResetting"
            @click="confirmReset"
          />
        </div>
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.ai-operator-detail {
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
  /* Stated explicitly: the global .form-field in forms.css is column, and a scoped rule only
     overrides the properties it names. */
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
/* The read-only rows caption a <p>, not a control, so their caption is a <span> — it still
   needs the same column treatment. */
.detail-field > .block-label,
/* FormField renders the label itself, so it carries the component's scope id rather than
   this file's — the same rule has to be repeated through :deep to reach it. */
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

.detail-field-block > .block-label {
  width: auto;
}

.field-input {
  flex: 1;
  min-width: 0;
}

:deep(.field-input input) {
  max-width: 100%;
}

.field-with-hint {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.number-input {
  width: 11rem;
}

.field-value {
  font-size: 0.875rem;
}

.field-error :deep(.p-inputtext),
.field-error :deep(.p-inputnumber-input) {
  border-color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.text-danger {
  color: var(--p-red-500);
}

.toggle-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  font-size: 0.875rem;
}

.persona-area {
  width: 100%;
  font-size: 0.8125rem;
  resize: vertical;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  column-gap: 2rem;
}

.state-text {
  margin: 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.state-text--mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  max-height: 14rem;
  overflow-y: auto;
}

.runtime-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.75rem;
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

.status-muted {
  color: var(--p-text-muted-color);
}
</style>
