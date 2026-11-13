<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import { useObject } from '@/queries/useObjectQueries'
import { useCreateScheduledTask, useUpdateScheduledTask } from '@/queries/useScheduledTaskQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** Null for create */
  task: {
    type: Object,
    default: null,
  },
  handlers: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'saved'])

const isNew = computed(() => props.task === null)
const isSystem = computed(() => props.task?.system === true)

const title = computed(() => {
  if (isNew.value) return 'New Scheduled Task'
  return props.task?.comments || props.task?.taskHandlerId || 'Scheduled Task'
})

const SCHEDULE_RECURRING = 'recurring'
const SCHEDULE_ONETIME = 'one-time'

const scheduleTypeOptions = [
  { label: 'Recurring (cron)', value: SCHEDULE_RECURRING },
  { label: 'One-time', value: SCHEDULE_ONETIME },
]

function buildForm(task) {
  return {
    taskHandlerId: task?.taskHandlerId ?? null,
    scheduleType: task
      ? task.recurrent
        ? SCHEDULE_RECURRING
        : SCHEDULE_ONETIME
      : SCHEDULE_RECURRING,
    schedule: task?.schedule ?? '',
    executionTime: task?.scheduledExecutionTime ? new Date(task.scheduledExecutionTime) : null,
    parameters: task?.parameters ?? '',
    comments: task?.comments ?? '',
    objectId: task?.objectId ?? 0,
    disabled: task?.disabled ?? false,
  }
}

const form = ref(buildForm(props.task))

const isDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.task)))

watch(
  () => props.task,
  (task) => {
    form.value = buildForm(task)
    selectedObjectName.value = null
  },
)

const objectPickerVisible = ref(false)
const selectedObjectName = ref(null)

const resolvedObjectId = computed(() => (form.value.objectId > 0 ? form.value.objectId : null))
const { data: resolvedObject } = useObject(resolvedObjectId)

const objectDisplayLabel = computed(() => {
  if (form.value.objectId === 0) return null
  if (selectedObjectName.value) return `${selectedObjectName.value} (#${form.value.objectId})`
  if (resolvedObject.value) return `${resolvedObject.value.name} (#${form.value.objectId})`
  return `Object #${form.value.objectId}`
})

function onObjectPicked(node) {
  form.value.objectId = node.id
  selectedObjectName.value = node.name
}

function clearObject() {
  form.value.objectId = 0
  selectedObjectName.value = null
}

const { mutate: createTask, isPending: isCreating, error: createError } = useCreateScheduledTask()
const { mutate: updateTask, isPending: isUpdating, error: updateError } = useUpdateScheduledTask()

const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  const payload = {
    comments: form.value.comments,
    disabled: form.value.disabled,
  }

  if (!isSystem.value) {
    payload.taskHandlerId = form.value.taskHandlerId
    payload.parameters = form.value.parameters
    payload.objectId = form.value.objectId ?? 0
  }

  if (form.value.scheduleType === SCHEDULE_RECURRING) {
    payload.schedule = form.value.schedule.trim()
  } else {
    payload.executionTime = form.value.executionTime?.toISOString() ?? null
  }

  if (isNew.value) {
    createTask(payload, { onSuccess: () => emit('close') })
  } else {
    updateTask({ id: props.task.id, data: payload }, { onSuccess: () => emit('saved') })
  }
}

function discard() {
  form.value = buildForm(props.task)
  selectedObjectName.value = null
  if (isNew.value) emit('close')
}

const allHandlerOptions = computed(() =>
  (props.handlers ?? []).map((h) => ({ label: h, value: h })),
)
</script>

<template>
  <div class="scheduled-task-detail">
    <EntityDetailHeader :title="title" subtitle="Scheduled Task" @back="emit('close')">
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
        <DetailCard title="General">
          <FormField v-if="!isNew" class="detail-field" label="ID" group>
            <span class="field-value field-value--mono">{{ task.id }}</span>
          </FormField>

          <FormField class="detail-field" label="Handler" group>
            <Select
              v-if="!isSystem"
              id="task-handler"
              v-model="form.taskHandlerId"
              :options="allHandlerOptions"
              option-label="label"
              option-value="value"
              placeholder="Select handler..."
              class="field-input"
            />
            <span v-else class="field-value field-value--mono">{{ task.taskHandlerId }}</span>
          </FormField>

          <FormField class="detail-field" label="Options" group>
            <div class="toggle-row">
              <ToggleSwitch v-model="form.disabled" input-id="task-disabled" />
              <label for="task-disabled" class="toggle-label">Task is disabled</label>
            </div>
          </FormField>

          <FormField v-if="isSystem" class="detail-field" label="Type" group>
            <Tag value="System" severity="warn" class="system-tag" />
          </FormField>
        </DetailCard>

        <DetailCard title="Schedule">
          <FormField class="detail-field" label="Type" v-slot="{ id }">
            <Select
              :input-id="id"
              id="task-schedule-type"
              v-model="form.scheduleType"
              :options="scheduleTypeOptions"
              option-label="label"
              option-value="value"
              class="field-input"
            />
          </FormField>

          <FormField
            v-if="form.scheduleType === 'recurring'"
            class="detail-field"
            label="Cron expression"
            group
          >
            <div class="cron-field">
              <InputText
                id="task-cron"
                v-model="form.schedule"
                placeholder="* * * * *"
                class="field-input cron-input"
              />
              <small class="cron-hint"
                >min&thinsp; hour&thinsp; day&thinsp; month&thinsp; weekday</small
              >
            </div>
          </FormField>

          <FormField v-else class="detail-field" label="Execution time" v-slot="{ id }">
            <DatePicker
              :input-id="id"
              id="task-exec-time"
              v-model="form.executionTime"
              show-time
              hour-format="24"
              show-icon
              class="field-input"
            />
          </FormField>

          <FormField
            v-if="!isNew && task.scheduledExecutionTime"
            class="detail-field"
            :label="`${task.recurrent ? 'Next run' : 'Scheduled'}`"
            group
          >
            <span class="field-value field-value--mono">{{ task.scheduledExecutionTime }}</span>
          </FormField>
        </DetailCard>

        <DetailCard v-if="!isSystem" title="Parameters">
          <div class="detail-field detail-field--block">
            <Textarea
              v-model="form.parameters"
              placeholder="Handler-specific parameters"
              rows="5"
              class="field-textarea"
            />
            <small class="field-hint">Format depends on the selected handler</small>
          </div>
        </DetailCard>

        <DetailCard title="Details" :wide="isSystem">
          <FormField class="detail-field" label="Object" group>
            <div v-if="!isSystem" class="object-picker-row">
              <div class="object-display" :class="{ 'object-display--empty': !objectDisplayLabel }">
                <ObjectIcon
                  v-if="resolvedObject"
                  :object="resolvedObject"
                  class="object-display-icon"
                />
                <i v-else class="pi pi-server object-display-icon" />
                <span>{{ objectDisplayLabel ?? 'None' }}</span>
              </div>
              <Button
                label="Browse..."
                severity="secondary"
                size="small"
                @click="objectPickerVisible = true"
              />
              <Button
                v-if="form.objectId > 0"
                icon="pi pi-times"
                severity="secondary"
                size="small"
                text
                @click="clearObject"
              />
            </div>
            <span v-else class="field-value">
              {{ task.objectId > 0 ? `Object #${task.objectId}` : 'None' }}
            </span>
          </FormField>

          <FormField class="detail-field detail-field--block" label="Comments" v-slot="{ id }">
            <Textarea
              :id="id"
              v-model="form.comments"
              placeholder="Optional description"
              rows="3"
              class="field-textarea"
            />
          </FormField>
        </DetailCard>
      </div>
    </div>
  </div>

  <ObjectPickerDialog
    v-model:visible="objectPickerVisible"
    title="Select Object"
    @select="onObjectPicked"
  />
</template>

<style scoped>
.scheduled-task-detail {
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
/* FormField's own label carries FormField's scope id, hence :deep. */
.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.detail-field--block {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding-top: 0.75rem;
}

.detail-field--block > label:first-child {
  width: auto;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-value {
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.field-value--mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.field-textarea {
  width: 100%;
  font-size: 0.875rem;
  resize: vertical;
}

.field-textarea :deep(textarea) {
  resize: vertical;
  max-width: 100%;
  box-sizing: border-box;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.cron-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cron-input :deep(input) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.cron-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  font-size: 0.875rem;
  cursor: pointer;
}

.system-tag {
  font-size: 0.75rem;
}

.object-picker-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.object-display {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius);
  background: var(--p-inputtext-background);
  font-size: 0.875rem;
  overflow: hidden;
}

.object-display span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-display--empty span {
  color: var(--p-text-muted-color);
}

.object-display-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}
</style>
