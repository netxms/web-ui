<script setup>
import { ref, computed, watch } from 'vue'
import { checkChassisOverlap } from './chassisUtils.js'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import { useObject } from '@/queries/useObjectQueries'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import FormField from '@/components/common/FormField.vue'

const HP_MM = 5.08 // mm per HP
const RU_MM = 44.45 // mm per RU

const ORIENTATIONS = [
  { label: 'Front only', value: 'front' },
  { label: 'Back only', value: 'back' },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  chassisId: { type: Number, required: true },
  chassisWidth: { type: Number, required: true },
  chassisHeight: { type: Number, required: true },
  /** 'hp-ru' | 'mm' */
  unitSystem: { type: String, default: 'hp-ru' },
  /** 'front-back' | 'front' */
  chassisMode: { type: String, default: 'front-back' },
  existingElements: { type: Array, default: () => [] },
  editElement: { type: Object, default: null },
  prefilledX: { type: Number, default: null },
  prefilledY: { type: Number, default: null },
  prefilledWidth: { type: Number, default: null },
  prefilledHeight: { type: Number, default: null },
})

const emit = defineEmits(['update:visible', 'save'])

// Display only; posX/posY/elWidth/elHeight are always integers in native units.
const showInMm = ref(false)

// A mm chassis is already mm
const canToggleUnit = computed(() => props.unitSystem === 'hp-ru')

const hUnit = computed(() => {
  if (props.unitSystem === 'mm') return 'mm'
  return showInMm.value ? 'mm' : 'HP'
})
const vUnit = computed(() => {
  if (props.unitSystem === 'mm') return 'mm'
  return showInMm.value ? 'mm' : 'RU'
})

function toggleUnit() {
  showInMm.value = !showInMm.value
}

function toDisplay(nativeVal, isHorizontal) {
  if (!showInMm.value || props.unitSystem !== 'hp-ru') return nativeVal
  return Math.round(nativeVal * (isHorizontal ? HP_MM : RU_MM) * 10) / 10
}

function toNative(displayVal, isHorizontal) {
  if (!showInMm.value || props.unitSystem !== 'hp-ru') return Math.round(displayVal)
  return Math.max(0, Math.round(displayVal / (isHorizontal ? HP_MM : RU_MM)))
}

const posX = ref(0)
const posY = ref(0)
const elWidth = ref(1)
const elHeight = ref(1)

const posXComp = computed({
  get: () => toDisplay(posX.value, true),
  set: (v) => {
    posX.value = toNative(v ?? 0, true)
  },
})
const posYComp = computed({
  get: () => toDisplay(posY.value, false),
  set: (v) => {
    posY.value = toNative(v ?? 0, false)
  },
})
const widthComp = computed({
  get: () => toDisplay(elWidth.value, true),
  set: (v) => {
    elWidth.value = Math.max(1, toNative(v ?? 1, true))
  },
})
const heightComp = computed({
  get: () => toDisplay(elHeight.value, false),
  set: (v) => {
    elHeight.value = Math.max(1, toNative(v ?? 1, false))
  },
})

const maxXDisplay = computed(() => toDisplay(props.chassisWidth, true))
const maxYDisplay = computed(() => toDisplay(props.chassisHeight, false))

const inputStep = computed(() => (showInMm.value ? 1 : 1))
const inputFractions = computed(() => (showInMm.value && props.unitSystem === 'hp-ru' ? 1 : 0))

const objectPickerVisible = ref(false)
const selectedObject = ref(null)
// Layout elements carry no category.
const { data: selectedObjectDetails } = useObject(() => selectedObject.value?.id ?? null)

function onObjectSelected(node) {
  selectedObject.value = { id: node.id, name: node.name, class: node.class }
  objectPickerVisible.value = false
}

function isSelectable(node) {
  return node.class === 'Node' || node.class === 'Chassis'
}

const orientation = ref('full')
const frontImageGuid = ref(null)
const backImageGuid = ref(null)

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    showInMm.value = false
    if (props.editElement) {
      const el = props.editElement
      selectedObject.value = el.objectId
        ? { id: el.objectId, name: el.objectName, class: el.objectClass }
        : null
      posX.value = el.x
      posY.value = el.y
      elWidth.value = el.width
      elHeight.value = el.height
      orientation.value = el.orientation ?? 'front'
      frontImageGuid.value = el.frontImageGuid ?? null
      backImageGuid.value = el.backImageGuid ?? null
    } else {
      selectedObject.value = null
      posX.value = props.prefilledX ?? 0
      posY.value = props.prefilledY ?? 0
      elWidth.value = props.prefilledWidth ?? 1
      elHeight.value = props.prefilledHeight ?? 1
      orientation.value = 'front'
      frontImageGuid.value = null
      backImageGuid.value = null
    }
  },
)

// Validation runs in native units

const boundsError = computed(() => {
  if (posX.value < 0 || posY.value < 0) return 'Position must be >= 0'
  if (elWidth.value < 1 || elHeight.value < 1) return 'Width and height must be >= 1'
  if (posX.value + elWidth.value > props.chassisWidth) {
    const avail = props.chassisWidth - posX.value
    return `Element exceeds chassis width (${avail}${hUnit.value} available from here)`
  }
  if (posY.value + elHeight.value > props.chassisHeight) {
    const avail = props.chassisHeight - posY.value
    return `Element exceeds chassis height (${avail}${vUnit.value} available from here)`
  }
  return null
})

const overlapError = computed(() =>
  checkChassisOverlap(
    props.existingElements,
    posX.value,
    posY.value,
    elWidth.value,
    elHeight.value,
    orientation.value,
    props.editElement?.id ?? null,
  ),
)

const isValid = computed(() => {
  if (boundsError.value || overlapError.value) return false
  return selectedObject.value != null
})

const showBackImage = computed(
  () => props.chassisMode === 'front-back' && orientation.value === 'back',
)

function onSave() {
  if (!isValid.value) return
  emit('save', {
    id: props.editElement?.id ?? null,
    chassisId: props.chassisId,
    x: posX.value,
    y: posY.value,
    width: elWidth.value,
    height: elHeight.value,
    orientation: props.chassisMode === 'front' ? 'front' : orientation.value,
    frontImageGuid: orientation.value === 'back' ? null : frontImageGuid.value,
    backImageGuid: showBackImage.value ? backImageGuid.value : null,
    objectId: selectedObject.value?.id ?? null,
    objectName: selectedObject.value?.name ?? null,
    objectClass: selectedObject.value?.class ?? null,
    label: selectedObject.value?.name ?? '',
  })
  emit('update:visible', false)
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="editElement ? 'Edit Chassis Element' : 'Add Chassis Element'"
    :modal="true"
    :closable="true"
    :style="{ width: '480px' }"
    @update:visible="onClose"
  >
    <div class="add-element-form">
      <!-- No single input to point a `for` at, so a labelled group. -->
      <FormField label="Object" group>
        <div class="object-selector">
          <div v-if="selectedObject" class="object-selector__selected">
            <ObjectIcon
              :object="selectedObjectDetails ?? selectedObject"
              class="object-selector__icon"
            />
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

      <div class="form-section">
        <div class="form-section__header">
          <span class="form-section__title">Position</span>
          <button v-if="canToggleUnit" type="button" class="unit-toggle" @click="toggleUnit">
            {{ showInMm ? 'HP / RU' : 'mm' }}
          </button>
        </div>
        <div class="form-row form-row--inline">
          <FormField :label="`X (${hUnit})`" v-slot="{ id }">
            <InputNumber
              autofocus
              :input-id="id"
              v-model="posXComp"
              :min="0"
              :max="maxXDisplay"
              :step="inputStep"
              :min-fraction-digits="0"
              :max-fraction-digits="inputFractions"
              size="small"
              show-buttons
            />
          </FormField>
          <FormField :label="`Y (${vUnit})`" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="posYComp"
              :min="0"
              :max="maxYDisplay"
              :step="inputStep"
              :min-fraction-digits="0"
              :max-fraction-digits="inputFractions"
              size="small"
              show-buttons
            />
          </FormField>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section__header">
          <span class="form-section__title">Size</span>
        </div>
        <div class="form-row form-row--inline">
          <FormField :label="`Width (${hUnit})`" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="widthComp"
              :min="showInMm ? 1 : 1"
              :max="maxXDisplay"
              :step="inputStep"
              :min-fraction-digits="0"
              :max-fraction-digits="inputFractions"
              size="small"
              show-buttons
            />
          </FormField>
          <FormField :label="`Height (${vUnit})`" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="heightComp"
              :min="showInMm ? 1 : 1"
              :max="maxYDisplay"
              :step="inputStep"
              :min-fraction-digits="0"
              :max-fraction-digits="inputFractions"
              size="small"
              show-buttons
            />
          </FormField>
        </div>
      </div>

      <div v-if="boundsError" class="form-error form-error--block">{{ boundsError }}</div>
      <div v-else-if="overlapError" class="form-error form-error--block">{{ overlapError }}</div>

      <FormField v-if="chassisMode === 'front-back'" label="Orientation" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="orientation"
          :options="ORIENTATIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>

      <!-- ImagePickerButton is a button, not an input, so these are labelled groups. -->
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

<style>
.p-inputnumber input {
  width: 100%;
}
</style>

<style scoped>
.add-element-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-surface-50);
}

.form-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-section__title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.unit-toggle {
  font-size: 0.6875rem;
  color: var(--p-primary-color);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.unit-toggle:hover {
  color: var(--p-primary-hover-color);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-row--inline {
  flex-direction: row;
  gap: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
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
