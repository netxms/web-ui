<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'

// Matches InstanceDiscovery.DISCOVERY_TYPES in the legacy client (indices with
// no label there are not valid instance discovery methods).
const DISCOVERY_METHOD_OPTIONS = [
  { label: 'None', value: 0 },
  { label: 'Agent List', value: 1 },
  { label: 'Agent Table', value: 2 },
  { label: 'Script', value: 5 },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (BusinessServiceRoot / BusinessService) */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const name = ref('')
const alias = ref('')
const instanceDiscoveryMethod = ref(0)

const isValid = computed(() => name.value.trim().length > 0)

function resetForm() {
  name.value = ''
  alias.value = ''
  instanceDiscoveryMethod.value = 0
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
      class: 'BusinessServiceProto',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      instanceDiscoveryMethod: instanceDiscoveryMethod.value,
    },
    successMessage: 'Business service prototype created',
    errorMessage: 'Failed to create business service prototype',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'business-services', params: { objectId: created.id } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Business Service Prototype"
    width="420px"
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

    <FormField label="Instance discovery method" v-slot="{ id }">
      <Select
        :input-id="id"
        v-model="instanceDiscoveryMethod"
        :options="DISCOVERY_METHOD_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
      />
    </FormField>
  </CreateDialogShell>
</template>
