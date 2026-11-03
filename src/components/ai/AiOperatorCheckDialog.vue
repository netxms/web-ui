<script setup>
/**
 * Create or edit one standing check of an AI operator instance (legacy
 * AiOperatorCheckEditDialog). Saves straight to the server, independently of the operator
 * form it is opened from.
 */
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { useCreateAiOperatorCheck, useUpdateAiOperatorCheck } from '@/queries/useAiOperatorQueries'
import {
  buildAiOperatorCheckPayload,
  validateAiOperatorCheck,
  CHECK_ACTION_OPTIONS,
  CHECK_DURATION_MAX,
  CHECK_INTERVAL_MIN,
  DEFAULT_CHECK,
  NAME_MAX_LENGTH,
} from '@/utils/aiOperatorDisplay'
import { formatDateTime, formatDurationCompact } from '@/utils/timeFormat'

const props = defineProps({
  visible: { type: Boolean, default: false },
  operatorId: { type: Number, required: true },
  /** The check to edit, or null to create one. */
  check: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'saved'])

/** Legacy `setTextLimit(255)` on the description. */
const DESCRIPTION_MAX_LENGTH = 255

const isNew = computed(() => props.check == null)

function buildForm(check) {
  const source = check ?? DEFAULT_CHECK
  return Object.fromEntries(Object.keys(DEFAULT_CHECK).map((key) => [key, source[key]]))
}

const form = ref(buildForm(props.check))
const errors = ref({})
const saveError = ref(null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = buildForm(props.check)
    errors.value = {}
    saveError.value = null
  },
)

const { mutate: createCheck, isPending: isCreating } = useCreateAiOperatorCheck()
const { mutate: updateCheck, isPending: isUpdating } = useUpdateAiOperatorCheck()
const isSaving = computed(() => isCreating.value || isUpdating.value)

function close() {
  emit('update:visible', false)
}

function onError(err) {
  if (err?.status === 409) {
    saveError.value =
      'This operator already has the maximum number of standing checks (AIOperator.Checks.MaxPerInstance).'
    return
  }
  // A 400 carries the server's reason, which includes the script compile error.
  saveError.value = err
}

function save() {
  saveError.value = null
  errors.value = validateAiOperatorCheck(form.value)
  if (Object.keys(errors.value).length > 0) return

  const data = buildAiOperatorCheckPayload(form.value, props.check)
  const onSuccess = () => {
    emit('saved')
    close()
  }

  if (isNew.value) {
    createCheck({ operatorId: props.operatorId, data }, { onSuccess, onError })
    return
  }
  if (Object.keys(data).length === 0) {
    close()
    return
  }
  updateCheck(
    { operatorId: props.operatorId, checkId: props.check.id, data },
    { onSuccess, onError },
  )
}

const hintFor = (seconds, zeroText) => (seconds > 0 ? formatDurationCompact(seconds) : zeroText)
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isNew ? 'Create Standing Check' : 'Edit Standing Check'"
    modal
    :style="{ width: '44rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="ai-dialog-body">
      <div class="ai-dialog-field">
        <label for="check-name">Name <span class="required-star">*</span></label>
        <InputText
          id="check-name"
          v-model="form.name"
          :maxlength="NAME_MAX_LENGTH"
          :class="{ 'p-invalid': errors.name }"
          autofocus
          fluid
        />
        <small v-if="errors.name" class="error-text">{{ errors.name }}</small>
      </div>

      <div class="ai-dialog-field">
        <label for="check-description">Description</label>
        <InputText
          id="check-description"
          v-model="form.description"
          :maxlength="DESCRIPTION_MAX_LENGTH"
          placeholder="What the check watches and why"
          fluid
        />
      </div>

      <div class="ai-dialog-field">
        <span class="field-caption">Object bound as $object</span>
        <ObjectPickerField v-model="form.objectId" empty-label="(none)" />
      </div>

      <div class="ai-dialog-field">
        <label for="check-action">Action when fired</label>
        <Select
          id="check-action"
          v-model="form.action"
          :options="CHECK_ACTION_OPTIONS"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>

      <div class="duration-row">
        <div class="ai-dialog-field">
          <label for="check-interval">Run interval <span class="required-star">*</span></label>
          <InputNumber
            input-id="check-interval"
            v-model="form.interval"
            :min="CHECK_INTERVAL_MIN"
            :max="CHECK_DURATION_MAX"
            :step="60"
            suffix=" s"
            show-buttons
            :class="{ 'p-invalid': errors.interval }"
            fluid
          />
          <small v-if="errors.interval" class="error-text">{{ errors.interval }}</small>
          <small v-else class="hint-text">{{ hintFor(form.interval, '') }}</small>
        </div>
        <div class="ai-dialog-field">
          <label for="check-cooldown">Cooldown (0 = none)</label>
          <InputNumber
            input-id="check-cooldown"
            v-model="form.cooldown"
            :min="0"
            :max="CHECK_DURATION_MAX"
            :step="60"
            suffix=" s"
            show-buttons
            fluid
          />
          <small class="hint-text">{{ hintFor(form.cooldown, 'None') }}</small>
        </div>
        <div class="ai-dialog-field">
          <label for="check-renotify">Renotify interval (0 = edge only)</label>
          <InputNumber
            input-id="check-renotify"
            v-model="form.renotifyInterval"
            :min="0"
            :max="CHECK_DURATION_MAX"
            :step="60"
            suffix=" s"
            show-buttons
            fluid
          />
          <small class="hint-text">{{ hintFor(form.renotifyInterval, 'Edge only') }}</small>
        </div>
      </div>

      <div class="ai-dialog-field">
        <span class="field-caption">Script <span class="required-star">*</span></span>
        <NxslScriptEditor
          v-model="form.source"
          hint-key="ai-operator-check"
          show-compile
          :rows="10"
        />
        <small v-if="errors.source" class="error-text">{{ errors.source }}</small>
      </div>

      <div class="check-flags">
        <label class="check-row" for="check-enabled">
          <Checkbox v-model="form.enabled" input-id="check-enabled" binary />
          Enabled
        </label>
        <label class="check-row" for="check-locked">
          <Checkbox v-model="form.locked" input-id="check-locked" binary />
          Locked (operator cannot modify or delete)
        </label>
      </div>

      <div v-if="!isNew" class="ai-dialog-field">
        <span class="field-caption">Run state</span>
        <div class="run-state">
          <div>
            Runs: {{ check.runCount ?? 0 }}, last run:
            {{ formatDateTime(check.lastRun) || 'never' }}, last fire:
            {{ formatDateTime(check.lastFire) || 'never' }}, consecutive errors:
            <span :class="{ 'text-danger': check.consecutiveErrors > 0 }">{{
              check.consecutiveErrors ?? 0
            }}</span>
          </div>
          <div v-if="check.lastPayload" class="run-state-payload">
            Last payload: {{ check.lastPayload }}
          </div>
          <div v-if="check.compileError" class="run-state-error">
            Compilation error: {{ check.compileError }}
          </div>
        </div>
      </div>

      <MutationErrorState :error="saveError" right="manageAiOperators" />
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button
        label="Save"
        severity="primary"
        :loading="isSaving"
        :disabled="isSaving"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.field-caption {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.duration-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  min-height: 1rem;
}

.check-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.run-state {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-ground);
  font-size: 0.8125rem;
}

.run-state-payload {
  font-family: var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 8rem;
  overflow-y: auto;
}

.run-state-error {
  color: var(--p-red-500);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text-danger {
  color: var(--p-red-500);
}
</style>
