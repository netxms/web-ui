<script setup>
import { ref, computed, watch, useId } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import RadioButton from 'primevue/radiobutton'
import FormField from '@/components/common/FormField.vue'
import MibOidPickerDialog from '@/components/mibs/MibOidPickerDialog.vue'
import { oidError } from '@/utils/snmpOid'
import {
  FLAG_FORCE_TEXT,
  MAX_DESCRIPTION_LENGTH,
  MAX_OID_LENGTH,
  MAX_POSITION,
} from '@/utils/snmpTrapMappings'

/** Edits the trap editor's working copy; the editor's Save sends it. */
const props = defineProps({
  visible: { type: Boolean, required: true },
  /** null to add one */
  parameter: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.parameter)

const ids = { byOid: useId(), byPosition: useId(), forceText: useId() }

const description = ref('')
const byPosition = ref(false)
const oid = ref('')
const position = ref(1)
const forceText = ref(false)
const oidErrorText = ref('')
const pickerVisible = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    const p = props.parameter
    description.value = p?.description ?? ''
    byPosition.value = (p?.position ?? 0) > 0
    oid.value = p?.oid ?? ''
    position.value = p?.position || 1
    forceText.value = !!((p?.flags ?? 0) & FLAG_FORCE_TEXT)
    oidErrorText.value = ''
  },
  { immediate: true },
)

const canSubmit = computed(() =>
  byPosition.value ? position.value >= 1 && position.value <= MAX_POSITION : !!oid.value.trim(),
)

function submit() {
  if (!byPosition.value) {
    oidErrorText.value = oidError(oid.value, { maxLength: MAX_OID_LENGTH })
    if (oidErrorText.value) return
  }
  // Flag bits other than force-text are not defined; any the server sent are kept.
  const otherFlags = (props.parameter?.flags ?? 0) & ~FLAG_FORCE_TEXT
  emit('save', {
    oid: byPosition.value ? '' : oid.value.trim(),
    position: byPosition.value ? position.value : 0,
    description: description.value,
    flags: otherFlags | (forceText.value ? FLAG_FORCE_TEXT : 0),
  })
  emit('update:visible', false)
}

function onOidPicked(picked) {
  oid.value = picked
  oidErrorText.value = ''
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? 'Edit Parameter Mapping' : 'Add Parameter Mapping'"
    modal
    :style="{ width: '36rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <FormField label="Description" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="description"
          :maxlength="MAX_DESCRIPTION_LENGTH"
          autofocus
          class="w-full"
        />
      </FormField>

      <FormField label="Varbind" group>
        <div class="varbind-options">
          <div class="radio-option">
            <RadioButton v-model="byPosition" :input-id="ids.byOid" :value="false" />
            <label :for="ids.byOid">By object ID (OID)</label>
          </div>
          <div class="option-body">
            <div class="oid-row">
              <InputText
                v-model="oid"
                :disabled="byPosition"
                :invalid="!!oidErrorText"
                :maxlength="MAX_OID_LENGTH"
                aria-label="Varbind OID"
                placeholder="e.g. 1.3.6.1.2.1.2.2.1.1"
                spellcheck="false"
                class="oid-input"
                @input="oidErrorText = ''"
              />
              <Button
                label="Select..."
                icon="pi pi-sitemap"
                size="small"
                severity="secondary"
                outlined
                :disabled="byPosition"
                @click="pickerVisible = true"
              />
            </div>
            <small v-if="oidErrorText" class="field-error" role="alert">{{ oidErrorText }}</small>
          </div>

          <div class="radio-option">
            <RadioButton v-model="byPosition" :input-id="ids.byPosition" :value="true" />
            <label :for="ids.byPosition">By position</label>
          </div>
          <div class="option-body position-row">
            <InputNumber
              v-model="position"
              :disabled="!byPosition"
              :min="1"
              :max="MAX_POSITION"
              :use-grouping="false"
              show-buttons
              aria-label="Varbind position"
              input-class="position-input"
            />
            <span class="field-hint"
              >Position of the varbind in the trap, 1 to {{ MAX_POSITION }}</span
            >
          </div>
        </div>
      </FormField>

      <FormField label="Options" group>
        <div class="radio-option">
          <Checkbox v-model="forceText" :input-id="ids.forceText" binary />
          <label :for="ids.forceText">Never convert value to hex string</label>
        </div>
      </FormField>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button
        :label="isEdit ? 'Apply' : 'Add'"
        icon="pi pi-check"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>

    <MibOidPickerDialog v-model:visible="pickerVisible" :oid="oid" @select="onOidPicked" />
  </Dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.varbind-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.radio-option label {
  font-size: 0.875rem;
  cursor: pointer;
}

.option-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-left: 1.75rem;
}

.oid-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.oid-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.position-row {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

.position-row :deep(.position-input) {
  width: 5.5rem;
}

.field-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.field-error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
</style>
