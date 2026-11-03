<script setup>
import { ref, computed, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['update:modelValue'])

const attrs = computed(() =>
  Object.entries(props.modelValue ?? {}).map(([name, value]) => ({ name, value })),
)

const editingName = ref(null)
const editValue = ref('')

function startEdit(attr) {
  editingName.value = attr.name
  editValue.value = attr.value
}

function commitEdit() {
  emit('update:modelValue', { ...props.modelValue, [editingName.value]: editValue.value })
  editingName.value = null
}

function cancelEdit() {
  editingName.value = null
}

function deleteAttr(name) {
  const next = { ...props.modelValue }
  delete next[name]
  emit('update:modelValue', next)
}

const addName = ref('')
const addValue = ref('')
const addNameError = ref('')

watch(addName, () => {
  addNameError.value = ''
})

function addAttr() {
  const name = addName.value.trim()
  if (!name) {
    addNameError.value = 'Name is required'
    return
  }
  addNameError.value = ''
  emit('update:modelValue', { ...props.modelValue, [name]: addValue.value })
  addName.value = ''
  addValue.value = ''
}

function onAddKeyEnter() {
  if (addName.value.trim()) addAttr()
}
</script>

<template>
  <div class="custom-attributes-editor">
    <div class="ca-header">
      <span class="ca-title">
        Custom Attributes
        <span class="ca-count">({{ attrs.length }})</span>
      </span>
    </div>

    <div class="ca-card">
      <table class="attr-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            <th class="col-value">Value</th>
            <th class="col-actions"></th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="attr in attrs" :key="attr.name">
            <template v-if="editingName === attr.name">
              <td class="col-name attr-name">{{ attr.name }}</td>
              <td class="col-value">
                <InputText
                  v-model="editValue"
                  class="row-input"
                  autofocus
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                />
              </td>
              <td class="col-actions">
                <Button
                  aria-label="Save attribute"
                  icon="pi pi-check"
                  size="small"
                  text
                  severity="success"
                  @click="commitEdit"
                />
                <Button
                  aria-label="Cancel editing"
                  icon="pi pi-times"
                  size="small"
                  text
                  severity="secondary"
                  @click="cancelEdit"
                />
              </td>
            </template>
            <template v-else>
              <td class="col-name attr-name">{{ attr.name }}</td>
              <td class="col-value attr-value">{{ attr.value }}</td>
              <td class="col-actions">
                <Button
                  :aria-label="`Edit ${attr.name}`"
                  icon="pi pi-pencil"
                  size="small"
                  text
                  severity="secondary"
                  :disabled="editingName !== null"
                  @click="startEdit(attr)"
                />
                <Button
                  :aria-label="`Delete ${attr.name}`"
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  :disabled="editingName !== null"
                  @click="deleteAttr(attr.name)"
                />
              </td>
            </template>
          </tr>

          <tr v-if="attrs.length === 0">
            <td colspan="3" class="empty-state">No custom attributes defined</td>
          </tr>
        </tbody>

        <tfoot class="add-footer" :class="{ 'has-error': addNameError }">
          <tr>
            <td class="col-name">
              <InputText
                v-model="addName"
                placeholder="Name"
                class="row-input"
                :class="{ 'p-invalid': addNameError }"
                @keyup.enter="onAddKeyEnter"
              />
              <small v-if="addNameError" class="add-error">{{ addNameError }}</small>
            </td>
            <td class="col-value">
              <InputText
                v-model="addValue"
                placeholder="Value"
                class="row-input"
                @keyup.enter="onAddKeyEnter"
              />
            </td>
            <td class="col-actions">
              <Button
                icon="pi pi-plus"
                size="small"
                text
                severity="secondary"
                @click="addAttr"
                aria-label="Add custom attribute"
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.custom-attributes-editor {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background: var(--p-surface-ground);
}

.ca-header {
  display: flex;
  align-items: center;
}

.ca-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.ca-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.ca-card {
  max-width: 1200px;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
}

.attr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.attr-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  background: color-mix(in srgb, var(--p-surface-border) 30%, var(--p-surface-card));
  border-bottom: 1px solid color-mix(in srgb, var(--p-text-color) 15%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--p-text-color) 15%, transparent);
  white-space: nowrap;
}

.attr-table th:last-child {
  border-right: none;
}

.attr-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
  border-bottom: 1px solid color-mix(in srgb, var(--p-text-color) 10%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--p-text-color) 10%, transparent);
}

.attr-table td:last-child {
  border-right: none;
}

.col-name {
  width: 30%;
}

.col-value {
  width: 55%;
}

.col-actions {
  width: 5rem;
  white-space: nowrap;
}

.attr-name {
  word-break: break-all;
}

.attr-value {
  word-break: break-word;
}

.row-input {
  width: 100%;
}

/* Qualified so it outranks the `.attr-table td` padding */
.attr-table .empty-state {
  text-align: center;
  padding: 1.5rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.add-footer td {
  position: relative;
  background: color-mix(in srgb, var(--p-surface-border) 30%, var(--p-surface-card));
  border-top: 2px solid color-mix(in srgb, var(--p-text-color) 15%, transparent);
  border-bottom: none;
}

/* The error sits in the bottom padding, which every footer cell grows by alike, so the
   inputs and the add button stay centred on one line */
.add-footer.has-error td {
  padding-bottom: 1.625rem;
}

.add-error {
  position: absolute;
  inset-inline-start: 0.5rem;
  bottom: 0.375rem;
  color: var(--p-red-500);
  font-size: 0.75rem;
  line-height: 1rem;
  white-space: nowrap;
}
</style>
