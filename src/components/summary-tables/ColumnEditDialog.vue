<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'

const FLAG_MULTIVALUED = 1
const FLAG_REGEXP_MATCH = 2
const FLAG_MATCH_DESCRIPTION = 4

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** Null for add mode */
  column: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:visible', 'confirm'])

function buildForm(column) {
  const flags = column?.flags ?? 0
  return {
    name: column?.name ?? '',
    dciName: column?.dciName ?? '',
    multivalued: !!(flags & FLAG_MULTIVALUED),
    regexpMatch: !!(flags & FLAG_REGEXP_MATCH),
    matchDescription: !!(flags & FLAG_MATCH_DESCRIPTION),
    separator: column?.separator ?? ';',
  }
}

const form = ref(buildForm(props.column))

watch(
  () => props.column,
  (column) => {
    form.value = buildForm(column)
  },
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) form.value = buildForm(props.column)
  },
)

const isEdit = computed(() => props.column !== null)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Column' : 'Add Column'))

const isValid = computed(() => form.value.name.trim() !== '' && form.value.dciName.trim() !== '')

function confirm() {
  if (!isValid.value) return
  let flags = 0
  if (form.value.multivalued) flags |= FLAG_MULTIVALUED
  if (form.value.regexpMatch) flags |= FLAG_REGEXP_MATCH
  if (form.value.matchDescription) flags |= FLAG_MATCH_DESCRIPTION
  emit('confirm', {
    name: form.value.name.trim(),
    dciName: form.value.dciName.trim(),
    flags,
    separator: form.value.multivalued ? form.value.separator || ';' : ';',
  })
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    modal
    :style="{ width: '480px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="column-form">
      <div class="form-field">
        <label for="col-name">Column name</label>
        <InputText
          id="col-name"
          v-model="form.name"
          placeholder="Display name for this column"
          class="field-input"
          autofocus
        />
      </div>

      <div class="form-field">
        <label for="col-dci-name">DCI name</label>
        <InputText
          id="col-dci-name"
          v-model="form.dciName"
          placeholder="DCI metric name"
          class="field-input"
        />
      </div>

      <div class="form-field form-field-checkbox">
        <Checkbox v-model="form.matchDescription" input-id="col-match-desc" :binary="true" />
        <label for="col-match-desc">Match by description instead of name</label>
      </div>

      <div class="form-field form-field-checkbox">
        <Checkbox v-model="form.regexpMatch" input-id="col-regexp" :binary="true" />
        <label for="col-regexp">Use regular expression for name or description matching</label>
      </div>

      <div class="form-field form-field-checkbox">
        <Checkbox v-model="form.multivalued" input-id="col-multivalued" :binary="true" />
        <label for="col-multivalued">Multivalued column</label>
      </div>

      <div v-if="form.multivalued" class="form-field">
        <label for="col-separator">Separator</label>
        <InputText
          id="col-separator"
          v-model="form.separator"
          placeholder=";"
          class="field-input-short"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" size="small" @click="cancel" />
      <Button label="OK" severity="primary" size="small" :disabled="!isValid" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.column-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.form-field {
  display: flex;
  /* The global .form-field in forms.css is column. */
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

.form-field > label:first-child {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.form-field-checkbox {
  gap: 0.5rem;
  padding-left: 0.25rem;
}

.form-field-checkbox > label {
  font-size: 0.875rem;
  cursor: pointer;
  width: auto !important;
  color: var(--p-text-color) !important;
  font-weight: normal !important;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-input-short {
  width: 6rem;
}
</style>
