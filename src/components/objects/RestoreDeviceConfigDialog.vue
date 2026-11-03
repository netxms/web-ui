<script setup>
/**
 * Restore a configuration backup onto a device, following the background task to its end.
 * `force` is never defaulted on: a driver mismatch comes back as 409 and the user must choose
 * "Apply anyway".
 */
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import RadioButton from 'primevue/radiobutton'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import FormField from '@/components/common/FormField.vue'
import { useRestoreDeviceConfig, useBackgroundTask } from '@/queries/useDeviceConfigBackupQueries'
import { formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  visible: { type: Boolean, required: true },
  sourceObject: { type: Object, required: true },
  backup: { type: Object, default: null },
  /** 'running' or 'startup' */
  initialConfigKind: { type: String, default: 'running' },
})

const emit = defineEmits(['update:visible', 'restored'])

const {
  mutate: startRestore,
  reset: resetRestore,
  isPending: isStarting,
  error: startError,
} = useRestoreDeviceConfig()

const configKind = ref(props.initialConfigKind)
const targetObject = ref(null)
const pickerVisible = ref(false)
const taskId = ref(null)
const driverMismatch = ref(false)

const { data: task, error: taskError } = useBackgroundTask(taskId)

// A reopened dialog must not keep a mismatch override the user has not re-made.
watch(
  () => props.visible,
  (open) => {
    if (!open) return
    configKind.value = props.initialConfigKind
    targetObject.value = props.sourceObject
    taskId.value = null
    driverMismatch.value = false
    resetRestore()
  },
)

const hasRunning = computed(() => (props.backup?.runningConfigSize ?? 0) > 0)
const hasStartup = computed(() => (props.backup?.startupConfigSize ?? 0) > 0)

const useStartupConfig = computed(() => configKind.value === 'startup')

const isSameNode = computed(() => targetObject.value?.id === props.sourceObject?.id)

/** `running` covers the window between 202 and a terminal state. */
const phase = computed(() => {
  if (!taskId.value) return 'confirm'
  if (taskError.value) return 'unknown'
  if (task.value?.state === 'completed') return 'completed'
  if (task.value?.state === 'failed') return 'failed'
  return 'running'
})

const submitError = computed(() => {
  if (!startError.value || driverMismatch.value) return null
  return startError.value.message
})

function pickTarget(object) {
  targetObject.value = object
  pickerVisible.value = false
}

function submit({ force = false } = {}) {
  if (!props.backup || !targetObject.value) return
  startRestore(
    {
      targetObjectId: targetObject.value.id,
      sourceObjectId: props.sourceObject.id,
      backupId: props.backup.id,
      useStartupConfig: useStartupConfig.value,
      force,
    },
    {
      onSuccess: (result) => {
        driverMismatch.value = false
        taskId.value = result?.taskId ?? null
      },
      onError: (err) => {
        // 409 is a driver mismatch.
        driverMismatch.value = err?.status === 409
      },
    },
  )
}

function close() {
  emit('update:visible', false)
}

function finish() {
  if (phase.value === 'completed') {
    emit('restored', { targetObjectId: targetObject.value?.id })
  }
  close()
}

const canCloseDuringRun = computed(() => phase.value !== 'running')

const dialogHeader = computed(() =>
  phase.value === 'confirm' ? 'Restore Device Configuration' : 'Restoring Device Configuration',
)
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogHeader"
    modal
    :closable="canCloseDuringRun"
    :close-on-escape="canCloseDuringRun"
    :style="{ width: '32rem' }"
    @update:visible="$event || close()"
  >
    <div v-if="phase === 'confirm'" class="restore-body">
      <dl class="restore-summary">
        <dt>Backup</dt>
        <dd>{{ backup ? formatDateTime(backup.timestamp) : '--' }}</dd>
        <dt>From node</dt>
        <dd>{{ sourceObject?.name ?? '--' }}</dd>
      </dl>

      <FormField v-if="hasRunning && hasStartup" label="Configuration to apply" group>
        <div class="restore-radios">
          <div class="restore-radio">
            <RadioButton v-model="configKind" input-id="restore-running" value="running" />
            <label for="restore-running">Running configuration</label>
          </div>
          <div class="restore-radio">
            <RadioButton v-model="configKind" input-id="restore-startup" value="startup" />
            <label for="restore-startup">Startup configuration</label>
          </div>
        </div>
      </FormField>

      <FormField label="Target node" group>
        <div class="restore-target">
          <span class="restore-target__name">{{ targetObject?.name ?? '--' }}</span>
          <Button
            label="Change..."
            size="small"
            severity="secondary"
            outlined
            @click="pickerVisible = true"
          />
        </div>
      </FormField>

      <Message v-if="!isSameNode" severity="warn" :closable="false">
        The backup was taken from a different device. Make sure
        <strong>{{ targetObject?.name }}</strong> is the intended replacement for
        <strong>{{ sourceObject?.name }}</strong
        >.
      </Message>

      <Message severity="error" :closable="false">
        Depending on the device driver the configuration is either merged into the current device
        configuration or replaces it completely. Existing settings on the target device may be
        changed or lost, and the device may become unreachable if the applied configuration changes
        its management access. This operation cannot be undone.
      </Message>

      <Message v-if="driverMismatch" severity="warn" :closable="false">
        The device driver of <strong>{{ targetObject?.name }}</strong> differs from the driver of
        <strong>{{ sourceObject?.name }}</strong
        >. The configuration may be incompatible with the target device.
      </Message>

      <Message v-else-if="submitError" severity="error" :closable="false">
        {{ submitError }}
      </Message>
    </div>

    <div v-else class="restore-body">
      <p class="restore-status">
        <template v-if="phase === 'running'">
          Applying configuration to <strong>{{ targetObject?.name }}</strong
          >...
        </template>
        <template v-else-if="phase === 'completed'">
          Configuration successfully restored on <strong>{{ targetObject?.name }}</strong
          >.
        </template>
        <template v-else-if="phase === 'failed'">
          Restore failed on <strong>{{ targetObject?.name }}</strong
          >.
        </template>
        <template v-else>
          The restore was started, but its progress can no longer be read from the server.
        </template>
      </p>

      <ProgressBar
        v-if="phase === 'running'"
        :value="task?.progress ?? 0"
        :show-value="(task?.progress ?? 0) > 0"
        :mode="(task?.progress ?? 0) > 0 ? 'determinate' : 'indeterminate'"
      />

      <Message v-if="phase === 'failed'" severity="error" :closable="false">
        {{ task?.failureReason || 'The server did not report a reason.' }}
      </Message>

      <Message v-else-if="phase === 'unknown'" severity="warn" :closable="false">
        Finished tasks are kept only briefly, so this may simply mean the restore completed before
        the first poll. Check the node's event log for SYS_DEVICE_CONFIG_RESTORE_COMPLETED or
        _FAILED.
      </Message>

      <Message v-else-if="phase === 'completed'" severity="success" :closable="false">
        The configuration was applied and saved as the device's startup configuration.
      </Message>
    </div>

    <template #footer>
      <template v-if="phase === 'confirm'">
        <Button label="Cancel" severity="secondary" text @click="close" />
        <Button
          v-if="driverMismatch"
          label="Apply anyway"
          severity="danger"
          :loading="isStarting"
          @click="submit({ force: true })"
        />
        <Button
          v-else
          label="Restore"
          severity="danger"
          :disabled="!backup || !targetObject"
          :loading="isStarting"
          @click="submit()"
        />
      </template>
      <Button v-else label="Close" :disabled="!canCloseDuringRun" @click="finish" />
    </template>

    <ObjectPickerDialog
      v-model:visible="pickerVisible"
      title="Select Target Node"
      :selectable="(node) => node.class === 'Node'"
      @select="pickTarget"
    />
  </Dialog>
</template>

<style scoped>
.restore-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.restore-summary {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.875rem;
}

.restore-summary dt {
  color: var(--p-text-muted-color);
}

.restore-summary dd {
  margin: 0;
}

.restore-radios {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.restore-radio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.restore-target {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.restore-target__name {
  font-weight: 500;
}

.restore-status {
  margin: 0;
  font-size: 0.875rem;
}
</style>
