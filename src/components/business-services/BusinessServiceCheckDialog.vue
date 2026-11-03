<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { useObject, useDciCurrentValues } from '@/queries/useObjectQueries'
import {
  useCreateBusinessServiceCheck,
  useUpdateBusinessServiceCheck,
} from '@/queries/useBusinessServiceQueries'
import {
  CHECK_THRESHOLD_OPTIONS,
  CHECK_TYPE_OPTIONS,
  buildCheckPayload,
  checkToForm,
  emptyCheckForm,
  validateCheckForm,
} from '@/utils/businessServiceChecks'
import { TEMPLATE_APPLICABLE_CLASSES } from '@/utils/objectUtils'

// Port of the legacy EditBusinessServiceCheckDlg; saves straight to the server. `readonly` is
// for automatically created checks, which the server refuses to modify.
const props = defineProps({
  visible: { type: Boolean, default: false },
  serviceId: { type: Number, required: true },
  /** null to create one. */
  check: { type: Object, default: null },
  readonly: { type: Boolean, default: false },
  /** Shown above the form. */
  readonlyReason: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'saved'])

const isNew = computed(() => props.check == null)

const header = computed(() => {
  if (props.readonly) return 'Business Service Check'
  return isNew.value ? 'Create Business Service Check' : 'Edit Business Service Check'
})

const form = ref(emptyCheckForm())
const errors = ref({})
const saveError = ref(null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.check ? checkToForm(props.check) : emptyCheckForm()
    errors.value = {}
    saveError.value = null
  },
  { immediate: true },
)

const isDci = computed(() => form.value.type === 'dci')
const isScript = computed(() => form.value.type === 'script')

const objectLabel = computed(() => {
  if (isDci.value) return 'Object'
  return isScript.value ? 'Related object' : 'Object to check'
})

const objectHint = computed(() => {
  if (isDci.value) return 'Node or other object that collects the DCI'
  return isScript.value ? 'Optional. The script gets it as $object (and $node).' : ''
})

/** A DCI check needs an object with live data collection; a template has none. */
const objectSelectable = computed(() =>
  isDci.value ? (node) => TEMPLATE_APPLICABLE_CLASSES.includes(node.class) : () => true,
)

function onObjectPicked(objectId) {
  // A DCI id only means something on the object it belongs to.
  if (objectId !== form.value.relatedObjectId) form.value.relatedDciId = 0
  form.value.relatedObjectId = objectId
  errors.value = {}
}

const dciObjectId = computed(() => (isDci.value ? form.value.relatedObjectId || null : null))
const { data: currentValues, isLoading: dciLoading } = useDciCurrentValues(dciObjectId)

const dciOptions = computed(() => {
  const options = (currentValues.value?.values ?? []).map((v) => ({
    label: `${v.description || v.name} (#${v.id})`,
    value: Number(v.id),
    description: v.description || v.name,
  }))
  // Keep a DCI the list does not have (deleted, or not readable) instead of clearing it.
  const dciId = form.value.relatedDciId
  if (dciId && !options.some((o) => o.value === dciId)) {
    options.unshift({ label: `DCI #${dciId}`, value: dciId, description: '' })
  }
  return options
})

const { data: relatedObject } = useObject(computed(() => form.value.relatedObjectId || null))

/** What a blank description becomes on save; shown as the placeholder. */
const fallbackDescription = computed(() => {
  if (isDci.value) {
    return dciOptions.value.find((o) => o.value === form.value.relatedDciId)?.description ?? ''
  }
  if (form.value.type === 'object' && form.value.relatedObjectId) {
    return relatedObject.value?.name ?? ''
  }
  return ''
})

const { mutate: createCheck, isPending: isCreating } = useCreateBusinessServiceCheck()
const { mutate: updateCheck, isPending: isUpdating } = useUpdateBusinessServiceCheck()
const isSaving = computed(() => isCreating.value || isUpdating.value)

function close() {
  emit('update:visible', false)
}

function onError(err) {
  saveError.value =
    err?.status === 409
      ? 'This check was created automatically (from a prototype or by auto-binding) and cannot be modified.'
      : err
}

function save() {
  saveError.value = null
  errors.value = validateCheckForm(form.value)
  if (Object.keys(errors.value).length > 0) return

  const data = buildCheckPayload(form.value, { fallbackDescription: fallbackDescription.value })
  const callbacks = {
    onSuccess: (check) => {
      emit('saved', check)
      close()
    },
    onError,
  }
  if (isNew.value) {
    createCheck({ objectId: props.serviceId, data }, callbacks)
  } else {
    updateCheck({ objectId: props.serviceId, checkId: props.check.id, data }, callbacks)
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :style="{ width: '46rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="check-form">
      <Message v-if="readonly && readonlyReason" severity="secondary" :closable="false">
        {{ readonlyReason }}
      </Message>

      <FormField label="Description" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="form.description"
          :placeholder="fallbackDescription || 'Unnamed'"
          :disabled="readonly"
          autofocus
          fluid
        />
      </FormField>

      <div class="field-row">
        <FormField label="Check type" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.type"
            :options="CHECK_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="readonly"
            fluid
            @update:model-value="errors = {}"
          />
        </FormField>
        <FormField
          label="Status threshold"
          :hint="
            isScript ? 'Not used by script checks' : 'Object or DCI status at which the check fails'
          "
          v-slot="{ id, describedBy }"
        >
          <Select
            :input-id="id"
            v-model="form.statusThreshold"
            :aria-describedby="describedBy"
            :options="CHECK_THRESHOLD_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="readonly || isScript"
            fluid
          />
        </FormField>
      </div>

      <FormField
        :label="objectLabel"
        :hint="errors.relatedObjectId ? '' : objectHint"
        :error="errors.relatedObjectId"
        :required="!isScript"
        group
      >
        <ObjectPickerField
          v-if="!readonly"
          :model-value="form.relatedObjectId"
          :selectable="objectSelectable"
          :dialog-title="isDci ? 'Select Object' : 'Select Object to Check'"
          empty-label="(none)"
          @update:model-value="onObjectPicked"
        />
        <span v-else class="readonly-value">{{
          form.relatedObjectId ? (relatedObject?.name ?? `[${form.relatedObjectId}]`) : '(none)'
        }}</span>
      </FormField>

      <FormField
        v-if="isDci"
        label="Data collection item"
        :error="errors.relatedDciId"
        required
        v-slot="{ id }"
      >
        <Select
          :input-id="id"
          v-model="form.relatedDciId"
          :options="dciOptions"
          option-label="label"
          option-value="value"
          :placeholder="form.relatedObjectId ? 'Select a DCI...' : 'Select an object first'"
          :disabled="readonly || !form.relatedObjectId"
          :loading="dciLoading && !!form.relatedObjectId"
          :invalid="!!errors.relatedDciId"
          filter
          fluid
        />
      </FormField>

      <FormField v-if="isScript" label="Check script" group>
        <NxslScriptEditor
          v-model="form.script"
          hint-key="business-service-check"
          show-compile
          :readonly="readonly"
          :rows="12"
        />
      </FormField>

      <MutationErrorState :error="saveError" />
    </div>

    <template #footer>
      <template v-if="readonly">
        <Button label="Close" severity="secondary" @click="close" />
      </template>
      <template v-else>
        <Button label="Cancel" severity="secondary" text @click="close" />
        <Button
          :label="isNew ? 'Create' : 'Save'"
          icon="pi pi-check"
          :loading="isSaving"
          :disabled="isSaving"
          @click="save"
        />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.check-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.readonly-value {
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
</style>
