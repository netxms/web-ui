<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'created'])

const name = ref('')
const alias = ref('')
const ipAddress = ref('')

// Validate CIDR — accepts IPv4 and IPv6 with prefix, e.g. "192.168.1.0/24" or "2001:db8::/32"
const cidrPattern = /^[\d.:a-fA-F]+\/\d{1,3}$/
const isValidCidr = computed(() => cidrPattern.test(ipAddress.value.trim()))
const isValid = computed(() => name.value.trim().length > 0 && isValidCidr.value)

function resetForm() {
  name.value = ''
  alias.value = ''
  ipAddress.value = ''
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
      class: 'Subnet',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      ipAddress: ipAddress.value.trim(),
    },
    successMessage: 'Subnet created',
    errorMessage: 'Failed to create subnet',
  })
  if (!created) return
  onClose()
  emit('created', created)
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Subnet"
    width="420px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
      <InputText :id="id" v-model="name" size="small" autofocus @keyup.enter="onCreate" />
    </FormField>

    <FormField label="Alias" v-slot="{ id }">
      <InputText :id="id" v-model="alias" size="small" @keyup.enter="onCreate" />
    </FormField>

    <FormField label="IP Address / Mask (CIDR)" required :empty="!ipAddress.trim()" v-slot="{ id }">
      <InputText
        :id="id"
        v-model="ipAddress"
        size="small"
        placeholder="192.168.1.0/24"
        :invalid="ipAddress.trim().length > 0 && !isValidCidr"
        @keyup.enter="onCreate"
      />
    </FormField>
  </CreateDialogShell>
</template>
