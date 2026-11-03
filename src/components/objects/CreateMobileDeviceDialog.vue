<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (Container / Collector / ServiceRoot) the mobile device is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const name = ref('')
const alias = ref('')
const deviceId = ref('')

const isValid = computed(() => name.value.trim().length > 0)

function resetForm() {
  name.value = ''
  alias.value = ''
  deviceId.value = ''
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
      class: 'MobileDevice',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      deviceId: deviceId.value.trim() || undefined,
    },
    successMessage: 'Mobile device created',
    errorMessage: 'Failed to create mobile device',
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
    header="Create Mobile Device"
    width="380px"
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

    <FormField label="Device ID" v-slot="{ id }">
      <InputText :id="id" v-model="deviceId" size="small" />
    </FormField>
  </CreateDialogShell>
</template>
