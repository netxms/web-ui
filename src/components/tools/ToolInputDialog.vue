<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  toolName: {
    type: String,
    default: '',
  },
  inputFields: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:visible', 'submit', 'cancel'])

const values = ref({})

const sortedFields = computed(() => [...props.inputFields].sort((a, b) => a.sequence - b.sequence))

function resetValues() {
  const v = {}
  for (const field of props.inputFields) {
    v[field.name] = field.type === 2 ? 0 : ''
  }
  values.value = v
}

function handleShow() {
  resetValues()
}

function handleSubmit() {
  emit('submit', { ...values.value })
  emit('update:visible', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

// field.type: 0 = text, 1 = password, 2 = number
function getFieldType(field) {
  switch (field.type) {
    case 1:
      return 'password'
    case 2:
      return 'number'
    default:
      return 'text'
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="toolName || 'Tool Input'"
    :modal="true"
    :closable="true"
    :style="{ width: '24rem' }"
    @update:visible="emit('update:visible', $event)"
    @show="handleShow"
  >
    <div class="tool-input-fields">
      <div v-for="field in sortedFields" :key="field.name" class="tool-input-field">
        <label :for="`tool-field-${field.name}`" class="tool-input-label">
          {{ field.displayName || field.name }}
        </label>

        <Password
          v-if="getFieldType(field) === 'password'"
          :id="`tool-field-${field.name}`"
          v-model="values[field.name]"
          :input-props="{ autocomplete: 'new-password' }"
          :feedback="false"
          toggle-mask
          fluid
        />
        <InputNumber
          v-else-if="getFieldType(field) === 'number'"
          :id="`tool-field-${field.name}`"
          v-model="values[field.name]"
          fluid
        />
        <InputText v-else :id="`tool-field-${field.name}`" v-model="values[field.name]" fluid />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="handleCancel" />
      <Button label="Execute" icon="pi pi-play" @click="handleSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.tool-input-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tool-input-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tool-input-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-color);
}
</style>
