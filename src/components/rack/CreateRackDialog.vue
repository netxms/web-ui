<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'
import { LIMITS } from '@/utils/dataCenterProperties'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (Container / ServiceRoot) the rack is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const name = ref('')
const alias = ref('')
const height = ref(42)
const width = ref(600)
const depth = ref(1000)

const isValid = computed(
  () => name.value.trim().length > 0 && height.value >= 1 && height.value <= 42,
)

function resetForm() {
  name.value = ''
  alias.value = ''
  height.value = 42
  width.value = 600
  depth.value = 1000
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
      class: 'Rack',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      height: height.value,
      width: width.value,
      depth: depth.value,
    },
    successMessage: 'Rack created',
    errorMessage: 'Failed to create rack',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'infrastructure', params: { objectId: created.id, viewId: 'rack' } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Rack"
    width="380px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
      <InputText
        :id="id"
        v-model="name"
        size="small"
        placeholder="e.g. Server Room Rack A"
        autofocus
      />
    </FormField>

    <FormField label="Alias" v-slot="{ id }">
      <InputText :id="id" v-model="alias" size="small" />
    </FormField>

    <FormField label="Height (U)" v-slot="{ id }">
      <InputNumber
        :input-id="id"
        v-model="height"
        :min="1"
        :max="42"
        size="small"
        show-buttons
        :step="1"
        suffix=" U"
      />
    </FormField>

    <div class="form-row-inline">
      <FormField label="Cabinet width" v-slot="{ id }">
        <InputNumber
          :input-id="id"
          v-model="width"
          :min="LIMITS.cabinet.min"
          :max="LIMITS.cabinet.max"
          :allow-empty="false"
          size="small"
          suffix=" mm"
          fluid
        />
      </FormField>
      <FormField label="Cabinet depth" v-slot="{ id }">
        <InputNumber
          :input-id="id"
          v-model="depth"
          :min="LIMITS.cabinet.min"
          :max="LIMITS.cabinet.max"
          :allow-empty="false"
          size="small"
          suffix=" mm"
          fluid
        />
      </FormField>
    </div>
  </CreateDialogShell>
</template>
