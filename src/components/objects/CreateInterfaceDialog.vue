<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent Node object the interface is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const name = ref('')
const alias = ref('')
const ifIndex = ref(null)
const macAddress = ref('')
const ipAddress = ref('')

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/
const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/

const isValid = computed(() => {
  if (name.value.trim().length === 0) return false
  if (macAddress.value.trim() && !MAC_PATTERN.test(macAddress.value.trim())) return false
  if (ipAddress.value.trim() && !IP_PATTERN.test(ipAddress.value.trim())) return false
  return true
})

function resetForm() {
  name.value = ''
  alias.value = ''
  ifIndex.value = null
  macAddress.value = ''
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
      class: 'Interface',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      ifIndex: ifIndex.value ?? undefined,
      macAddress: macAddress.value.trim() || undefined,
      ipAddress: ipAddress.value.trim() || undefined,
    },
    successMessage: 'Interface created',
    errorMessage: 'Failed to create interface',
  })
  if (!created) return
  onClose()
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Interface"
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

    <FormField label="Interface index (ifIndex)" v-slot="{ id }">
      <InputNumber :input-id="id" v-model="ifIndex" size="small" :min="0" :use-grouping="false" />
    </FormField>

    <FormField label="MAC address" v-slot="{ id }">
      <InputText :id="id" v-model="macAddress" size="small" placeholder="e.g. 00:11:22:33:44:55" />
    </FormField>

    <FormField label="IP address" v-slot="{ id }">
      <InputText :id="id" v-model="ipAddress" size="small" placeholder="e.g. 192.168.1.1" />
    </FormField>
  </CreateDialogShell>
</template>
