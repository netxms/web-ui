<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import { useCreateIncident } from '@/queries/useIncidentQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** "Create incident from alarm" prefill: the full source node, as ObjectPickerInput gives it. */
  presetObject: { type: Object, default: null },
  presetTitle: { type: String, default: '' },
  sourceAlarmId: { type: Number, default: 0 },
})

const emit = defineEmits(['update:visible', 'created'])

const toast = useToast()
const { mutateAsync: createIncident, isPending } = useCreateIncident()

const sourceObject = ref(null)
const title = ref('')
const initialComment = ref('')

// Reapplied on each open: the alarm it was launched from differs.
watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible) return
    sourceObject.value = props.presetObject
    title.value = props.presetTitle
    initialComment.value = ''
  },
  { immediate: true },
)

const isValid = computed(() => sourceObject.value != null && title.value.trim().length > 0)

function close() {
  emit('update:visible', false)
}

async function onCreate() {
  if (!isValid.value) return
  try {
    const incident = await createIncident({
      sourceObjectId: sourceObject.value.id,
      title: title.value.trim(),
      initialComment: initialComment.value.trim() || null,
      sourceAlarmId: props.sourceAlarmId || 0,
    })
    close()
    emit('created', incident)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Failed to create incident',
      detail: e?.message,
      life: 4000,
    })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Incident"
    width="520px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="close"
    @create="onCreate"
  >
    <div class="form-grid-2">
      <ObjectPickerInput
        v-model="sourceObject"
        label="Source object"
        required
        dialog-title="Select Source Object"
      />

      <FormField label="Title" required :empty="!title.trim()" v-slot="{ id }">
        <!-- Server stores the title in a 256-char buffer. -->
        <InputText :id="id" v-model="title" size="small" maxlength="255" autofocus />
      </FormField>

      <FormField label="Initial comment" v-slot="{ id }">
        <Textarea :id="id" v-model="initialComment" rows="4" auto-resize />
      </FormField>
    </div>
  </CreateDialogShell>
</template>
