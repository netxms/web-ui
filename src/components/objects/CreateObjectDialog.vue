<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import { getClassLabel } from '@/utils/objectUtils'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object the new object will be created under */
  parentObject: { type: Object, default: null },
  /** Object class to create (e.g. 'Container', 'Condition', 'AssetGroup') */
  objectClass: { type: String, default: null },
})

// 'created' carries the full ObjectDetails; callers decide where to navigate.
const emit = defineEmits(['update:visible', 'created'])

const name = ref('')
const alias = ref('')

const classLabel = computed(() => getClassLabel(props.objectClass))
const isValid = computed(() => name.value.trim().length > 0)

function resetForm() {
  name.value = ''
  alias.value = ''
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

async function onCreate() {
  if (!isValid.value || !props.parentObject || !props.objectClass) return

  const created = await submitCreate({
    payload: {
      class: props.objectClass,
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
    },
    successMessage: `${classLabel.value} created`,
    errorMessage: `Failed to create ${classLabel.value.toLowerCase()}`,
  })
  if (!created) return
  onClose()
  emit('created', created)
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    :header="`Create ${classLabel}`"
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
  </CreateDialogShell>
</template>
