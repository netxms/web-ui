<script setup>
import { computed, watch } from 'vue'
import Select from 'primevue/select'
import ObjectSelectorField from './ObjectSelectorField.vue'
import { useDciCurrentValues } from '@/queries/useObjectQueries'

const props = defineProps({
  /** "Node" on the charts, "Object" on Table Value. */
  objectLabel: { type: String, default: 'Node' },
  objectId: { type: [Number, String], default: null },
  objectName: { type: String, default: '' },
  dciId: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:objectId', 'update:objectName', 'update:dciId'])

const objectId = computed(() => props.objectId || null)

const { data: currentValues, isLoading } = useDciCurrentValues(objectId)

// Table DCIs only; `isTable` comes off the numeric type the value summary carries.
const dciOptions = computed(() =>
  (currentValues.value?.values ?? [])
    .filter((v) => v.isTable)
    .map((v) => ({ label: `${v.description || v.name} (#${v.id})`, value: Number(v.id) })),
)

// A DCI id only means something on the node it belongs to, so changing the node clears it.
watch(objectId, (next, previous) => {
  if (previous != null && next !== previous) emit('update:dciId', null)
})
</script>

<template>
  <ObjectSelectorField
    :label="objectLabel"
    placeholder="Not selected"
    :object-id="props.objectId"
    :object-name="props.objectName"
    @update:object-id="emit('update:objectId', $event)"
    @update:object-name="emit('update:objectName', $event)"
  />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-table-dci">Table DCI</label>
    <Select
      id="wpd-table-dci"
      :model-value="props.dciId"
      :options="dciOptions"
      option-label="label"
      option-value="value"
      :placeholder="objectId ? 'Select a table DCI...' : 'Select an object first'"
      :disabled="!objectId"
      :loading="isLoading"
      class="wpd-input"
      @update:model-value="emit('update:dciId', $event)"
    />
    <small v-if="objectId && !isLoading && dciOptions.length === 0" class="wpd-hint">
      This object has no table DCIs.
    </small>
  </div>
</template>
