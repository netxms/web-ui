<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import { useCloudConnectors } from '@/queries/useCloudConnectorQueries'
import FormField from '@/components/common/FormField.vue'

// Matches the removalPolicy values handled in cloud_domain.cpp
const REMOVAL_POLICY_OPTIONS = [
  { label: 'Mark inactive', value: 0 },
  { label: 'Delete after grace period', value: 1 },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (Container / Collector / ServiceRoot) the cloud domain is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const { data: connectorNames, isLoading: connectorsLoading } = useCloudConnectors()

const connectorOptions = computed(() => (connectorNames.value ?? []).map((name) => ({ name })))

const name = ref('')
const alias = ref('')
const connectorName = ref('')
const credentials = ref('')
const discoveryFilter = ref('')
const removalPolicy = ref(0)
const gracePeriod = ref(7)

const isValid = computed(
  () => name.value.trim().length > 0 && connectorName.value.trim().length > 0,
)

function resetForm() {
  name.value = ''
  alias.value = ''
  connectorName.value = ''
  credentials.value = ''
  discoveryFilter.value = ''
  removalPolicy.value = 0
  gracePeriod.value = 7
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
      class: 'CloudDomain',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      connectorName: connectorName.value.trim(),
      credentials: credentials.value.trim() || undefined,
      discoveryFilter: discoveryFilter.value.trim() || undefined,
      removalPolicy: removalPolicy.value,
      gracePeriod: removalPolicy.value === 1 ? gracePeriod.value : undefined,
    },
    successMessage: 'Cloud domain created',
    errorMessage: 'Failed to create cloud domain',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'infrastructure', params: { objectId: created.id } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Cloud Domain"
    width="460px"
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

    <FormField label="Connector" required :empty="!connectorName.trim()" v-slot="{ id }">
      <Select
        :input-id="id"
        v-model="connectorName"
        :options="connectorOptions"
        option-label="name"
        option-value="name"
        size="small"
        :loading="connectorsLoading"
        :placeholder="connectorsLoading ? 'Loading connectors...' : 'Select a connector'"
        empty-message="No available connectors"
      />
    </FormField>

    <FormField label="Credentials" v-slot="{ id }">
      <Textarea
        :id="id"
        v-model="credentials"
        rows="4"
        auto-resize
        size="small"
        placeholder="Raw JSON"
      />
    </FormField>

    <FormField label="Resource discovery filter" v-slot="{ id }">
      <InputText :id="id" v-model="discoveryFilter" size="small" />
    </FormField>

    <FormField label="Removal policy" v-slot="{ id }">
      <Select
        :input-id="id"
        v-model="removalPolicy"
        :options="REMOVAL_POLICY_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
      />
    </FormField>

    <FormField
      v-if="removalPolicy === 1"
      class="form-row"
      label="Grace period (seconds)"
      v-slot="{ id }"
    >
      <InputNumber
        :input-id="id"
        v-model="gracePeriod"
        size="small"
        :min="0"
        :use-grouping="false"
      />
    </FormField>
  </CreateDialogShell>
</template>
