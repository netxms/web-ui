<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'

// Matches NetworkService.* constants in the legacy client
const SERVICE_TYPE_OPTIONS = [
  { label: 'User-defined', value: 0 },
  { label: 'SSH', value: 1 },
  { label: 'POP3', value: 2 },
  { label: 'SMTP', value: 3 },
  { label: 'FTP', value: 4 },
  { label: 'HTTP', value: 5 },
  { label: 'HTTPS', value: 6 },
  { label: 'Telnet', value: 7 },
]

const IP_PROTOCOL_OPTIONS = [
  { label: 'TCP', value: 6 },
  { label: 'UDP', value: 17 },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent Node object the network service is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const name = ref('')
const alias = ref('')
const serviceType = ref(0)
const ipProtocol = ref(6)
const ipPort = ref(80)
const request = ref('')
const response = ref('')
const createStatusDci = ref(false)

const isValid = computed(
  () => name.value.trim().length > 0 && ipPort.value >= 1 && ipPort.value <= 65535,
)

function resetForm() {
  name.value = ''
  alias.value = ''
  serviceType.value = 0
  ipProtocol.value = 6
  ipPort.value = 80
  request.value = ''
  response.value = ''
  createStatusDci.value = false
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'NetworkService',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      serviceType: serviceType.value,
      ipProtocol: ipProtocol.value,
      ipPort: ipPort.value,
      request: request.value || undefined,
      response: response.value || undefined,
      createStatusDci: createStatusDci.value,
    },
    successMessage: 'Network service created',
    errorMessage: 'Failed to create network service',
  })
  if (!created) return
  onClose()
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Network Service"
    width="440px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
      <InputText :id="id" v-model="name" size="small" autofocus />
    </FormField>

    <FormField label="Alias" v-slot="{ id }">
      <InputText :id="id" v-model="alias" size="small" />
    </FormField>

    <div class="form-row-inline">
      <FormField label="Service type" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="serviceType"
          :options="SERVICE_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>
      <FormField label="Protocol" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="ipProtocol"
          :options="IP_PROTOCOL_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>
    </div>

    <FormField label="Port" v-slot="{ id }">
      <InputNumber
        :input-id="id"
        v-model="ipPort"
        size="small"
        :min="1"
        :max="65535"
        :use-grouping="false"
      />
    </FormField>

    <FormField label="Request" v-slot="{ id }">
      <InputText :id="id" v-model="request" size="small" />
    </FormField>

    <FormField label="Response" v-slot="{ id }">
      <InputText :id="id" v-model="response" size="small" />
    </FormField>

    <div class="form-row checkbox-row">
      <Checkbox v-model="createStatusDci" input-id="ns-create-dci" :binary="true" />
      <label for="ns-create-dci">Create service status DCI at parent node</label>
    </div>
  </CreateDialogShell>
</template>
