<script setup>
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useObjectsByIds } from '@/queries/useObjectQueries'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const allAttrs = computed(() => props.draft.customAttributes ?? [])

// Redefined attrs are local overrides of inherited ones
const ownAttrs = computed(() =>
  allAttrs.value.filter((a) => a.sourceObject === 0 || a.flags?.redefined),
)
// Includes conflict attrs
const inheritedAttrs = computed(() =>
  allAttrs.value.filter((a) => a.sourceObject !== 0 && !a.flags?.redefined),
)

const hasInherited = computed(() => inheritedAttrs.value.length > 0)
const showSourceCol = computed(
  () => hasInherited.value || ownAttrs.value.some((a) => a.sourceObject !== 0),
)

const parentIds = computed(() => [
  ...new Set(allAttrs.value.filter((a) => a.sourceObject !== 0).map((a) => a.sourceObject)),
])
const { objectsById } = useObjectsByIds(parentIds)

function parentName(sourceObject) {
  return objectsById.value.get(sourceObject)?.name ?? `Object #${sourceObject}`
}

function isInheritable(attr) {
  return attr.flags?.inheritable ?? false
}

function isRedefined(attr) {
  return attr.flags?.redefined ?? false
}

function isConflict(attr) {
  return attr.flags?.conflict ?? false
}

const editingName = ref(null)
const editAttrValue = ref('')
const editInheritable = ref(false)

function startEdit(attr) {
  editingName.value = attr.name
  editAttrValue.value = attr.value
  editInheritable.value = isInheritable(attr)
}

function commitEdit() {
  const existing = props.draft.customAttributes.find((a) => a.name === editingName.value)
  if (!existing) {
    editingName.value = null
    return
  }

  const idx = props.draft.customAttributes.indexOf(existing)

  if (existing.sourceObject === 0 || existing.flags?.redefined) {
    props.draft.customAttributes[idx] = {
      ...existing,
      value: editAttrValue.value,
      flags: { ...existing.flags, inheritable: editInheritable.value },
    }
  } else {
    props.draft.customAttributes[idx] = {
      ...existing,
      value: editAttrValue.value,
      flags: { ...existing.flags, inheritable: editInheritable.value, redefined: true },
    }
  }
  editingName.value = null
}

function cancelEdit() {
  editingName.value = null
}

function deleteAttr(name) {
  props.draft.customAttributes = props.draft.customAttributes.filter((a) => a.name !== name)
}

const addName = ref('')
const addAttrValue = ref('')
const addInheritable = ref(false)
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

  const existingIdx = props.draft.customAttributes.findIndex(
    (a) => a.name === name && (a.sourceObject === 0 || a.flags?.redefined),
  )
  if (existingIdx !== -1) {
    props.draft.customAttributes[existingIdx] = {
      ...props.draft.customAttributes[existingIdx],
      value: addAttrValue.value,
      flags: {
        ...props.draft.customAttributes[existingIdx].flags,
        inheritable: addInheritable.value,
      },
    }
  } else {
    props.draft.customAttributes = [
      ...props.draft.customAttributes,
      {
        name,
        value: addAttrValue.value,
        flags: { inheritable: addInheritable.value, redefined: false, conflict: false },
        sourceObject: 0,
      },
    ]
  }

  addName.value = ''
  addAttrValue.value = ''
  addInheritable.value = false
}

function onAddKeyEnter() {
  if (addName.value.trim()) addAttr()
}
</script>

<template>
  <div class="custom-attributes-section">
    <div class="ca-header">
      <span class="ca-title">
        Custom Attributes
        <span class="ca-count">({{ allAttrs.length }})</span>
      </span>
    </div>

    <div class="ca-card">
      <table class="attr-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            <th class="col-value">Value</th>
            <th class="col-flag">Inheritable</th>
            <th class="col-state">State</th>
            <th v-if="showSourceCol" class="col-origin">Source</th>
            <th class="col-actions"></th>
          </tr>
        </thead>

        <tbody class="inherited-body">
          <tr
            v-for="attr in inheritedAttrs"
            :key="`inh-${attr.name}`"
            class="inherited-row"
            :class="{ 'conflict-row': isConflict(attr) }"
          >
            <template v-if="editingName === attr.name">
              <td class="col-name attr-name inherited-editing-name">{{ attr.name }}</td>
              <td class="col-value">
                <InputText
                  v-model="editAttrValue"
                  class="row-input"
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                />
              </td>
              <td class="col-flag center">
                <Checkbox v-model="editInheritable" :binary="true" />
              </td>
              <td class="col-state"></td>
              <td v-if="showSourceCol" class="col-origin">
                <Tag :value="parentName(attr.sourceObject)" severity="secondary" />
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
              <td class="col-flag center">
                <i v-if="isInheritable(attr)" class="pi pi-check flag-check" />
              </td>
              <td class="col-state">
                <span
                  v-if="isConflict(attr)"
                  v-tooltip="
                    'This attribute is inherited from multiple sources with conflicting values. Edit to define a local override.'
                  "
                >
                  <Tag value="Conflict" severity="warn" />
                </span>
                <Tag v-else value="Inherited" severity="secondary" />
              </td>
              <td v-if="showSourceCol" class="col-origin">
                <Tag :value="parentName(attr.sourceObject)" severity="secondary" />
              </td>
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
              </td>
            </template>
          </tr>
        </tbody>

        <tbody class="own-body">
          <tr v-for="attr in ownAttrs" :key="attr.name">
            <template v-if="editingName === attr.name">
              <td class="col-name attr-name">{{ attr.name }}</td>
              <td class="col-value">
                <InputText
                  v-model="editAttrValue"
                  class="row-input"
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                />
              </td>
              <td class="col-flag center">
                <Checkbox v-model="editInheritable" :binary="true" />
              </td>
              <td class="col-state"></td>
              <td v-if="showSourceCol" class="col-origin">
                <Tag
                  v-if="isRedefined(attr)"
                  :value="parentName(attr.sourceObject)"
                  severity="secondary"
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
              <td class="col-flag center">
                <i v-if="isInheritable(attr)" class="pi pi-check flag-check" />
              </td>
              <td class="col-state">
                <span
                  v-if="isRedefined(attr)"
                  v-tooltip="'This value overrides an inherited attribute from the source object.'"
                >
                  <Tag value="Overrides" severity="info" />
                </span>
              </td>
              <td v-if="showSourceCol" class="col-origin">
                <Tag
                  v-if="isRedefined(attr)"
                  :value="parentName(attr.sourceObject)"
                  severity="secondary"
                />
              </td>
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

          <tr v-if="ownAttrs.length === 0 && inheritedAttrs.length === 0">
            <td :colspan="showSourceCol ? 6 : 5" class="empty-state">
              No custom attributes defined
            </td>
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
                v-model="addAttrValue"
                placeholder="Value"
                class="row-input"
                @keyup.enter="onAddKeyEnter"
              />
            </td>
            <td class="col-flag center">
              <div class="add-flag">
                <Checkbox v-model="addInheritable" :binary="true" input-id="add-inheritable" />
                <label for="add-inheritable" class="flag-label">Inheritable</label>
              </div>
            </td>
            <td class="col-state"></td>
            <td v-if="showSourceCol" class="col-origin"></td>
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
.custom-attributes-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

.inherited-body tr:last-child td {
  border-bottom: 2px solid color-mix(in srgb, var(--p-text-color) 15%, transparent);
}

.col-name {
  width: 24%;
}

.col-value {
  width: 36%;
}

.col-flag {
  width: 7rem;
}

.col-state {
  width: 8rem;
}

.col-origin {
  width: 12rem;
}

.col-actions {
  width: 5rem;
  white-space: nowrap;
}

.center {
  text-align: center;
}

.attr-name {
  word-break: break-all;
}

.attr-value {
  word-break: break-word;
}

.flag-check {
  font-size: 0.75rem;
  color: var(--p-green-500);
}

.row-input {
  width: 100%;
}

.inherited-row td {
  color: var(--p-text-muted-color);
  background-color: color-mix(in srgb, var(--p-surface-border) 12%, var(--p-surface-card));
}

.inherited-editing-name {
  color: var(--p-text-muted-color);
}

.conflict-row td {
  background-color: color-mix(in srgb, var(--p-amber-500) 8%, transparent);
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
   inputs, the Inheritable checkbox and the add button stay centred on one line */
.add-footer.has-error td {
  padding-bottom: 1.625rem;
}

.add-flag {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
}

.flag-label {
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
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
