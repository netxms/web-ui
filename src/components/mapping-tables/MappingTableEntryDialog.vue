<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import FormField from '@/components/common/FormField.vue'
import { MAX_KEY_LENGTH, MAX_TEXT_LENGTH, validateEntries } from '@/utils/mappingTables'

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** Null to add one. */
  entry: { type: Object, default: null },
  entries: { type: Array, default: () => [] },
  numeric: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.entry)

const key = ref('')
const value = ref('')
const description = ref('')
const keyError = ref('')
const keyInput = ref()

function reset() {
  keyError.value = ''
  key.value = props.entry?.key ?? ''
  value.value = props.entry?.value ?? ''
  description.value = props.entry?.description ?? ''
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) reset()
  },
  { immediate: true },
)

function validate(candidateKey) {
  const self = props.entry?.id ?? Symbol('new')
  const others = props.entries.filter((e) => e.id !== self)
  return (
    validateEntries([...others, { id: self, key: candidateKey }], props.numeric).get(self) ?? ''
  )
}

async function submit(keepOpen) {
  const trimmed = key.value.trim()
  keyError.value = validate(trimmed)
  if (keyError.value) return
  emit('save', { key: trimmed, value: value.value, description: description.value })
  if (!keepOpen) {
    emit('update:visible', false)
    return
  }
  key.value = ''
  value.value = ''
  description.value = ''
  await nextTick()
  keyInput.value?.$el?.focus()
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? 'Edit Entry' : 'Add Entry'"
    modal
    :style="{ width: '34rem' }"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <FormField
        label="Key"
        required
        :hint="numeric ? 'Decimal or 0x-prefixed hexadecimal number' : ''"
        :error="keyError"
        :empty="!key.trim()"
        v-slot="{ id, describedBy }"
      >
        <InputText
          :id="id"
          ref="keyInput"
          v-model="key"
          :aria-describedby="describedBy"
          :maxlength="MAX_KEY_LENGTH"
          autofocus
          spellcheck="false"
          class="w-full entry-mono"
          @input="keyError = ''"
        />
      </FormField>

      <FormField label="Value" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="value"
          :maxlength="MAX_TEXT_LENGTH"
          spellcheck="false"
          class="w-full entry-mono"
        />
      </FormField>

      <FormField label="Description" v-slot="{ id }">
        <InputText :id="id" v-model="description" :maxlength="MAX_TEXT_LENGTH" class="w-full" />
      </FormField>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onHide" />
      <Button
        v-if="!isEdit"
        label="Add & Next"
        icon="pi pi-plus"
        severity="secondary"
        outlined
        @click="submit(true)"
      />
      <Button :label="isEdit ? 'Apply' : 'Add'" icon="pi pi-check" @click="submit(false)" />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.entry-mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}
</style>
