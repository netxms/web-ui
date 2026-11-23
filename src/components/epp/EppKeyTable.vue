<script setup>
import { ref, computed, useId } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

defineOptions({ name: 'EppKeyTable' })

const props = defineProps({
  /** `{ key, value }[]` with a `valueLabel`, plain keys without one. */
  modelValue: { type: Array, required: true },
  keyLabel: { type: String, default: 'Key' },
  /** Adds a value column. */
  valueLabel: { type: String, default: null },
  /** One row, for the buttons' accessible names ("Remove custom attribute site"). */
  itemName: { type: String, required: true },
  title: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const titleId = useId()
const newKey = ref('')
const newValue = ref('')

const rows = computed(() =>
  props.valueLabel ? props.modelValue : props.modelValue.map((key) => ({ key })),
)

const canAdd = computed(() => newKey.value.trim() !== '')

function add() {
  const key = newKey.value.trim()
  if (!key) return
  if (props.valueLabel) {
    const entry = { key, value: newValue.value }
    const index = props.modelValue.findIndex((e) => e.key === key)
    emit(
      'update:modelValue',
      index === -1
        ? [...props.modelValue, entry]
        : props.modelValue.map((e, i) => (i === index ? entry : e)),
    )
  } else {
    if (props.modelValue.includes(key)) return
    emit('update:modelValue', [...props.modelValue, key])
  }
  newKey.value = ''
  newValue.value = ''
}

function onKeyEnter() {
  if (!props.valueLabel) add()
}

function remove(key) {
  emit(
    'update:modelValue',
    props.valueLabel
      ? props.modelValue.filter((e) => e.key !== key)
      : props.modelValue.filter((k) => k !== key),
  )
}
</script>

<template>
  <div class="epp-key-table">
    <div v-if="title" :id="titleId" class="edit-table-title">{{ title }}</div>
    <div class="edit-table-card">
      <table class="edit-table" :aria-labelledby="title ? titleId : undefined">
        <colgroup>
          <col :class="{ 'epp-key-table__key-col': valueLabel }" />
          <col v-if="valueLabel" />
          <col class="edit-table__actions-col" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ keyLabel }}</th>
            <th v-if="valueLabel">{{ valueLabel }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <td class="edit-table__mono" :title="row.key">{{ row.key }}</td>
            <td v-if="valueLabel" class="edit-table__mono" :title="row.value">{{ row.value }}</td>
            <td class="edit-table__actions">
              <Button
                :aria-label="`Remove ${itemName} ${row.key}`"
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                @click="remove(row.key)"
              />
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <InputText
                v-model="newKey"
                :placeholder="keyLabel"
                :aria-label="`New ${itemName}: ${keyLabel.toLowerCase()}`"
                size="small"
                class="edit-table__input epp-key-table__input"
                @keyup.enter="onKeyEnter"
              />
            </td>
            <td v-if="valueLabel">
              <InputText
                v-model="newValue"
                :placeholder="valueLabel"
                :aria-label="`New ${itemName}: ${valueLabel.toLowerCase()}`"
                size="small"
                class="edit-table__input epp-key-table__input"
                @keyup.enter="add"
              />
            </td>
            <td class="edit-table__actions">
              <Button
                :aria-label="`Add ${itemName}`"
                icon="pi pi-plus"
                text
                rounded
                severity="secondary"
                size="small"
                :disabled="!canAdd"
                @click="add"
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped src="./eppEditTable.css"></style>

<style scoped>
.epp-key-table {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.epp-key-table__key-col {
  width: 35%;
}

.epp-key-table__input {
  font-family: var(--font-mono);
}
</style>
