<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (Container / Collector / ServiceRoot) the chassis is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const name = ref('')
const alias = ref('')
const controller = ref(null)

const isValid = computed(() => name.value.trim().length > 0)

function resetForm() {
  name.value = ''
  alias.value = ''
  controller.value = null
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

function isNodeSelectable(node) {
  return node.class === 'Node'
}

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'Chassis',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      controllerId: controller.value?.id ?? undefined,
    },
    successMessage: 'Chassis created',
    errorMessage: 'Failed to create chassis',
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
    header="Create Chassis"
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

    <ObjectPickerInput
      v-model="controller"
      label="Controller"
      dialog-title="Select Controller Node"
      :selectable="isNodeSelectable"
    />
  </CreateDialogShell>
</template>
