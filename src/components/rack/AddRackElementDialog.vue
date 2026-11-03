<script setup>
import { ref, computed, watch } from 'vue'
import { checkOverlap } from './rackUtils.js'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import FormField from '@/components/common/FormField.vue'

const PASSIVE_TYPES = [
  { label: 'PDU', value: 'PDU' },
  { label: 'Patch Panel', value: 'PatchPanel' },
  { label: 'Organizer', value: 'Organizer' },
  { label: 'Filter Panel', value: 'FilterPanel' },
]

const ORIENTATIONS = [
  { label: 'Full depth', value: 'full' },
  { label: 'Front only', value: 'front' },
  { label: 'Back only', value: 'back' },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  rackId: { type: Number, required: true },
  rackHeight: { type: Number, required: true },
  /** 'front-back' | 'front' */
  rackMode: { type: String, default: 'front-back' },
  existingElements: { type: Array, default: () => [] },
  editElement: { type: Object, default: null },
  prefilledSlot: { type: Number, default: null },
  prefilledHeightU: { type: Number, default: null },
})

const emit = defineEmits(['update:visible', 'save'])

const elementType = ref('object') // 'object' | 'passive'

const typeOptions = [
  { label: 'Object', value: 'object' },
  { label: 'Passive element', value: 'passive' },
]

const objectPickerVisible = ref(false)
const selectedObject = ref(null) // { id, name, class }

function onObjectSelected(node) {
  selectedObject.value = { id: node.id, name: node.name, class: node.class }
  objectPickerVisible.value = false
}

function isSelectable(node) {
  return node.class === 'Node' || node.class === 'Chassis'
}

const passiveType = ref('PDU')
const label = ref('')
const slot = ref(1)
const heightU = ref(1)
const orientation = ref('full')
const frontImageGuid = ref(null)
const backImageGuid = ref(null)

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    if (props.editElement) {
      const el = props.editElement
      elementType.value = el.objectId ? 'object' : 'passive'
      selectedObject.value = el.objectId
        ? { id: el.objectId, name: el.objectName, class: el.objectClass }
        : null
      passiveType.value = el.passiveType ?? 'PDU'
      label.value = el.label ?? ''
      slot.value = el.slot
      heightU.value = el.heightU
      orientation.value = el.orientation ?? 'full'
      frontImageGuid.value = el.frontImageGuid ?? null
      backImageGuid.value = el.backImageGuid ?? null
    } else {
      elementType.value = 'object'
      selectedObject.value = null
      passiveType.value = 'PDU'
      label.value = ''
      slot.value = props.prefilledSlot ?? 1
      heightU.value = props.prefilledHeightU ?? 1
      orientation.value = 'full'
      frontImageGuid.value = null
      backImageGuid.value = null
    }
  },
)

const slotError = computed(() => {
  if (slot.value < 1 || slot.value > props.rackHeight) {
    return `Slot must be between 1 and ${props.rackHeight}`
  }
  if (slot.value + heightU.value - 1 > props.rackHeight) {
    return `Element exceeds rack height (max ${props.rackHeight - slot.value + 1}U here)`
  }
  return null
})

const overlapError = computed(() =>
  checkOverlap(
    props.existingElements,
    slot.value,
    heightU.value,
    orientation.value,
    props.editElement?.id ?? null,
  ),
)

const isValid = computed(() => {
  if (slotError.value || overlapError.value) return false
  if (elementType.value === 'object') return selectedObject.value != null
  return label.value.trim().length > 0 || passiveType.value
})

const showBackImage = computed(() => {
  return (
    props.rackMode === 'front-back' &&
    (orientation.value === 'full' || orientation.value === 'back')
  )
})

function onSave() {
  if (!isValid.value) return

  const data = {
    id: props.editElement?.id ?? null,
    rackId: props.rackId,
    slot: slot.value,
    heightU: heightU.value,
    orientation: props.rackMode === 'front' ? 'front' : orientation.value,
    frontImageGuid: orientation.value === 'back' ? null : frontImageGuid.value,
    backImageGuid: showBackImage.value ? backImageGuid.value : null,
    objectId: elementType.value === 'object' ? (selectedObject.value?.id ?? null) : null,
    objectName: elementType.value === 'object' ? (selectedObject.value?.name ?? null) : null,
    objectClass: elementType.value === 'object' ? (selectedObject.value?.class ?? null) : null,
    passiveType: elementType.value === 'passive' ? passiveType.value : null,
    label: elementType.value === 'passive' ? label.value : (selectedObject.value?.name ?? ''),
    portCount: props.editElement?.portCount ?? 0,
  }

  emit('save', data)
  emit('update:visible', false)
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="editElement ? 'Edit Rack Element' : 'Add Rack Element'"
    :modal="true"
    :closable="true"
    :style="{ width: '480px' }"
    @update:visible="onClose"
  >
    <div class="add-element-form">
      <div class="form-row">
        <SelectButton
          autofocus
          v-model="elementType"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
        />
      </div>

      <template v-if="elementType === 'object'">
        <!-- No input to point a `for` at, so this is a labelled group. -->
        <FormField label="Object" group>
          <div class="object-selector">
            <div v-if="selectedObject" class="object-selector__selected">
              <i class="pi pi-server object-selector__icon" />
              <span class="object-selector__name">{{ selectedObject.name }}</span>
              <span class="object-selector__class">{{ selectedObject.class }}</span>
              <Button
                aria-label="Clear selected object"
                icon="pi pi-times"
                text
                severity="secondary"
                size="small"
                @click="selectedObject = null"
              />
            </div>
            <Button
              v-else
              label="Pick object..."
              icon="pi pi-search"
              outlined
              severity="secondary"
              size="small"
              @click="objectPickerVisible = true"
            />
          </div>
        </FormField>
      </template>

      <template v-else>
        <FormField label="Type" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="passiveType"
            :options="PASSIVE_TYPES"
            option-label="label"
            option-value="value"
            size="small"
          />
        </FormField>
        <FormField label="Label" v-slot="{ id }">
          <InputText :id="id" v-model="label" size="small" placeholder="e.g. Patch Panel A" />
        </FormField>
      </template>

      <FormField label="Starting slot (U)" :error="slotError" v-slot="{ id, describedBy }">
        <InputNumber
          :input-id="id"
          :aria-describedby="describedBy"
          v-model="slot"
          :min="1"
          :max="rackHeight"
          size="small"
          show-buttons
          :step="1"
        />
      </FormField>

      <FormField label="Height (U)" v-slot="{ id }">
        <InputNumber
          :input-id="id"
          v-model="heightU"
          :min="1"
          :max="rackHeight"
          size="small"
          show-buttons
          :step="1"
        />
      </FormField>

      <div v-if="overlapError" class="form-error form-error--block">
        {{ overlapError }}
      </div>

      <FormField v-if="rackMode === 'front-back'" label="Orientation" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="orientation"
          :options="ORIENTATIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>

      <!-- ImagePickerButton is not an input, so these are labelled groups. -->
      <FormField v-if="orientation !== 'back'" label="Front image" group>
        <ImagePickerButton v-model="frontImageGuid" label="Select front image" />
      </FormField>

      <FormField v-if="showBackImage" label="Back image" group>
        <ImagePickerButton v-model="backImageGuid" label="Select back image" />
      </FormField>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onClose" />
      <Button label="Save" :disabled="!isValid" @click="onSave" />
    </template>

    <ObjectPickerDialog
      :visible="objectPickerVisible"
      title="Select Node or Chassis"
      :selectable="isSelectable"
      @update:visible="objectPickerVisible = $event"
      @select="onObjectSelected"
    />
  </Dialog>
</template>

<style scoped>
.add-element-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-error {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.form-error--block {
  padding: 0.375rem 0.5rem;
  background: var(--p-red-50);
  border-radius: var(--p-border-radius-sm);
}

.object-selector__selected {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
}

.object-selector__icon {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.object-selector__name {
  font-size: 0.875rem;
  flex: 1;
}

.object-selector__class {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-100);
  padding: 1px 6px;
  border-radius: 10px;
}
</style>
