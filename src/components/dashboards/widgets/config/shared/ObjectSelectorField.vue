<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import FormField from '@/components/common/FormField.vue'
import { CONTEXT_OBJECT_ID, isContextObjectId } from '@/utils/dashboardContext'

const props = defineProps({
  label: { type: String, required: true },
  objectId: { type: [Number, String], default: null },
  objectName: { type: String, default: '' },
  placeholder: { type: String, default: 'Not selected' },
  /** ObjectPickerDialog perspectives; defaults to Infrastructure */
  perspectives: {
    type: Array,
    default: () => [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }],
  },
  pickerTitle: { type: String, default: 'Select Object' },
  /** Offer the dashboard's context object: stores the legacy context sentinel. */
  allowContext: { type: Boolean, default: false },
})

const emit = defineEmits(['update:objectId', 'update:objectName'])

const pickerVisible = ref(false)

const displayLabel = computed(() => {
  if (!props.objectId) return null
  if (isContextObjectId(props.objectId)) return 'Context object'
  return props.objectName ? `${props.objectName} (#${props.objectId})` : `Object #${props.objectId}`
})

function onPicked(node) {
  emit('update:objectId', node.id)
  emit('update:objectName', node.name)
  pickerVisible.value = false
}

function useContext() {
  emit('update:objectId', CONTEXT_OBJECT_ID)
  emit('update:objectName', '')
}

function clear() {
  emit('update:objectId', null)
  emit('update:objectName', '')
}
</script>

<template>
  <FormField class="wpd-field" :label="`${label}`" group>
    <div class="wpd-picker-row">
      <span class="wpd-picker-value" :class="{ 'wpd-picker-value--empty': !displayLabel }">
        {{ displayLabel ?? placeholder }}
      </span>
      <Button
        icon="pi pi-search"
        size="small"
        severity="secondary"
        @click="pickerVisible = true"
        aria-label="Select object"
      />
      <Button
        v-if="allowContext"
        v-tooltip.top="'Use the object the dashboard is shown for'"
        icon="pi pi-link"
        size="small"
        severity="secondary"
        aria-label="Use the object the dashboard is shown for"
        @click="useContext"
      />
      <Button
        aria-label="Clear selected object"
        v-if="objectId"
        icon="pi pi-times"
        size="small"
        severity="secondary"
        text
        @click="clear"
      />
    </div>
  </FormField>

  <ObjectPickerDialog
    v-model:visible="pickerVisible"
    :title="pickerTitle"
    :perspectives="perspectives"
    @select="onPicked"
  />
</template>
