<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import FormField from '@/components/common/FormField.vue'

defineProps({
  /** The full node from ObjectPickerDialog's @select, not just { id, name } (e.g. zoneUIN). */
  modelValue: { type: Object, default: null },
  label: { type: String, default: null },
  emptyLabel: { type: String, default: 'None' },
  dialogTitle: { type: String, default: 'Select Object' },
  perspectives: { type: Array, default: undefined },
  selectable: { type: Function, default: () => true },
  displayFilter: { type: Function, default: undefined },
  required: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

function open() {
  pickerVisible.value = true
}

function clear() {
  emit('update:modelValue', null)
}

function onSelect(node) {
  emit('update:modelValue', node)
}
</script>

<template>
  <FormField :label="label" :required="required" :empty="!modelValue" v-slot="{ id }">
    <div class="object-picker-input">
      <InputText
        :id="id"
        :model-value="modelValue?.name || emptyLabel"
        size="small"
        readonly
        class="object-picker-text"
        @click="open"
      />
      <Button
        aria-label="Clear selected object"
        v-if="modelValue"
        icon="pi pi-times"
        text
        severity="secondary"
        size="small"
        @click="clear"
      />
      <Button
        icon="pi pi-search"
        text
        severity="secondary"
        size="small"
        @click="open"
        aria-label="Select object"
      />
    </div>
  </FormField>

  <ObjectPickerDialog
    v-model:visible="pickerVisible"
    :title="dialogTitle"
    :perspectives="perspectives"
    :selectable="selectable"
    :display-filter="displayFilter"
    @select="onSelect"
  />
</template>

<style scoped>
.object-picker-input {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.object-picker-text {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

/* The shared required-empty rule borders the last child, here the flex wrapper; move it to
   the input. */
.form-field--required-empty > .object-picker-input {
  border-left: none;
}

.form-field--required-empty > .object-picker-input .object-picker-text {
  border-left: 6px solid var(--p-red-400);
}
</style>
