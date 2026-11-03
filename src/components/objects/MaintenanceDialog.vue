<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import ScheduleTimeInput from '@/components/objects/ScheduleTimeInput.vue'
import { useSetObjectMaintenance } from '@/queries/useObjectQueries'
import FormField from '@/components/common/FormField.vue'
import { dispatchMaintenanceResult } from '@/utils/maintenanceResult'

const props = defineProps({
  visible: { type: Boolean, required: true },
  objects: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible'])

const { mutateAsync: setMaintenanceAsync, isPending } = useSetObjectMaintenance()

const comments = ref('')
const scheduleEnabled = ref(false)
const startTime = ref(null)
const endTime = ref(null)
const resetKey = ref(0)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      comments.value = ''
      scheduleEnabled.value = false
      startTime.value = null
      endTime.value = null
      resetKey.value++
    }
  },
)

const canSubmit = computed(() => {
  if (!scheduleEnabled.value) return true
  return startTime.value != null || endTime.value != null
})

const submitLabel = computed(() =>
  scheduleEnabled.value ? 'Schedule Maintenance' : 'Start Maintenance',
)

function toApiTime(value) {
  return value instanceof Date ? value.toISOString() : value
}

async function onConfirm() {
  const payload = { comments: comments.value }

  if (scheduleEnabled.value) {
    if (startTime.value != null) {
      payload.startTime = toApiTime(startTime.value)
    } else {
      payload.maintenance = true
    }
    if (endTime.value != null) {
      payload.endTime = toApiTime(endTime.value)
    }
  } else {
    payload.maintenance = true
  }

  // Not all-or-nothing: some objects can fail on rights while the rest really are in
  // maintenance now. Each mutation invalidates its own caches.
  const results = await Promise.allSettled(
    props.objects.map((object) => setMaintenanceAsync({ id: object.id, ...payload })),
  )
  const { succeeded } = dispatchMaintenanceResult({
    objects: props.objects,
    results,
    maintenance: true,
  })
  if (succeeded.length > 0) emit('update:visible', false)
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Start Maintenance"
    modal
    :style="{ width: '620px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="maintenance-body">
      <p v-if="objects.length === 1" class="maintenance-hint">
        Put <strong>{{ objects[0]?.name }}</strong> into maintenance mode.
      </p>
      <p v-else class="maintenance-hint">
        Put <strong>{{ objects.length }} objects</strong> into maintenance mode.
      </p>

      <div class="maintenance-field toggle-row">
        <ToggleSwitch autofocus v-model="scheduleEnabled" input-id="maintenance-schedule" />
        <label for="maintenance-schedule">Schedule maintenance</label>
      </div>

      <div v-if="scheduleEnabled" class="schedule-fields">
        <FormField class="maintenance-field" label="Start time" group>
          <ScheduleTimeInput :key="`start-${resetKey}`" v-model="startTime" />
          <small class="field-hint">Leave empty to enter maintenance immediately</small>
        </FormField>

        <FormField class="maintenance-field" label="End time" group>
          <ScheduleTimeInput :key="`end-${resetKey}`" v-model="endTime" />
          <small class="field-hint">Leave empty to leave maintenance manually</small>
        </FormField>
      </div>

      <FormField class="maintenance-field" label="Comments (optional)" v-slot="{ id }">
        <Textarea
          :id="id"
          v-model="comments"
          class="maintenance-comments"
          rows="3"
          auto-resize
          placeholder="Reason for maintenance..."
        />
      </FormField>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        :label="submitLabel"
        icon="pi pi-wrench"
        :disabled="!canSubmit"
        :loading="isPending"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.maintenance-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.maintenance-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.maintenance-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.maintenance-field label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.toggle-row {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.toggle-row label {
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.schedule-fields {
  display: flex;
  gap: 1rem;
}

.schedule-fields .maintenance-field {
  flex: 1;
  min-width: 0;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.maintenance-comments {
  width: 100%;
}
</style>
