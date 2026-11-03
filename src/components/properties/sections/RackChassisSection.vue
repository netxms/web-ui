<script setup>
/**
 * Mirrors the legacy PhysicalContainerPlacement page. A Node may sit in a rack or a chassis; a
 * Chassis only in a rack. `position` is edited as stored: the element's topmost unit in the
 * rack's own numbering direction.
 */
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Message from 'primevue/message'
import FormField from '@/components/common/FormField.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import { useObject, useRackLayout } from '@/queries/useObjectQueries'

// draft is a shared mutable object from usePropertyEditor - mutations are intentional
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const RACK_ORIENTATIONS = [
  { label: 'Fill', value: 0 },
  { label: 'Front', value: 1 },
  { label: 'Rear', value: 2 },
]

const CHASSIS_ORIENTATIONS = [
  { label: 'Front', value: 1 },
  { label: 'Rear', value: 2 },
]

const VERTICAL_UNITS = [
  { label: 'RU', value: 0 },
  { label: 'mm', value: 1 },
]

const HORIZONTAL_UNITS = [
  { label: 'HP', value: 0 },
  { label: 'mm', value: 1 },
]

/** Geometry a node gets when it is first put into a chassis (matches ChassisPlacement.java). */
const DEFAULT_CHASSIS_PLACEMENT = {
  image: null,
  width: 1,
  widthUnits: 0,
  height: 1,
  heightUnits: 0,
  positionWidth: 0,
  positionWidthUnits: 0,
  positionHeight: 0,
  positionHeightUnits: 0,
  orientation: 1,
}

const placement = computed(() => props.draft.physicalPlacement)
const containerId = computed(() => placement.value?.containerId ?? 0)

const { data: container } = useObject(computed(() => containerId.value || null))

const containerClass = computed(() => container.value?.class ?? null)
const isChassisContainer = computed(() => containerClass.value === 'Chassis')
const isRackContainer = computed(() => {
  // A chassis can only go into a rack, so it shows the rack fields even with an empty selector.
  if (containerId.value === 0) return props.object.class === 'Chassis'
  // Guessing "rack" before the container loads would fire the rack-layout query at a chassis.
  return containerClass.value === 'Rack'
})

// Rack height and numbering direction are not on the placed object.
const { data: rackLayout } = useRackLayout(
  computed(() => (isRackContainer.value ? containerId.value : null)),
)
const rackHeight = computed(() => rackLayout.value?.height ?? 42)
const topBottomNumbering = computed(() => rackLayout.value?.topBottomNumbering ?? false)

const selectedContainer = computed(() =>
  containerId.value
    ? (container.value ?? { id: containerId.value, name: `[${containerId.value}]` })
    : null,
)

// Top-to-bottom racks: the element grows downward from its position. Bottom-up: it grows
// upward, so its own height is the lowest legal position.
const positionBounds = computed(() => {
  const height = placement.value?.height || 1
  return topBottomNumbering.value
    ? { min: 1, max: Math.max(1, rackHeight.value - height + 1) }
    : { min: height, max: rackHeight.value }
})

const extentWarning = computed(() => {
  const p = placement.value
  if (!isRackContainer.value || !p || containerId.value === 0) return null
  const height = p.height || 1
  if (p.position < 1) return 'Position must be at least 1.'
  if (topBottomNumbering.value) {
    if (p.position + height > rackHeight.value + 1) {
      return `Element does not fit: the rack is ${rackHeight.value}U.`
    }
  } else if (p.position - height < 0 || p.position > rackHeight.value) {
    return `Element does not fit: the rack is ${rackHeight.value}U.`
  }
  return null
})

// Also the picker's display filter; the dialog keeps the ancestors of every match.
function isSelectableContainer(node) {
  if (props.object.class === 'Chassis') return node.class === 'Rack'
  return node.class === 'Rack' || node.class === 'Chassis'
}

function onContainerChange(node) {
  const p = placement.value
  if (!node) {
    // Clearing only unbinds; the stored geometry stays.
    p.containerId = 0
    return
  }
  p.containerId = node.id
  if (node.class === 'Chassis') {
    // The server seeds nothing for a node never placed in a chassis, and orientation 0 would
    // draw it in neither chassis view.
    if (!p.chassisPlacement) p.chassisPlacement = { ...DEFAULT_CHASSIS_PLACEMENT }
  } else if (p.position < 1) {
    // Placing into a rack requires a position that fits; 0 means "never placed" and is a 400.
    p.position = p.height || 1
  }
}

function chassisField(key, value) {
  placement.value.chassisPlacement = {
    ...(placement.value.chassisPlacement ?? DEFAULT_CHASSIS_PLACEMENT),
    [key]: value,
  }
}

// Exposed for the unit tests.
defineExpose({ onContainerChange, positionBounds })
</script>

<template>
  <div class="rack-chassis-section">
    <fieldset class="form-fieldset">
      <legend>Physical Placement</legend>
      <ObjectPickerInput
        :model-value="selectedContainer"
        :label="object.class === 'Chassis' ? 'Rack' : 'Rack or chassis'"
        :dialog-title="object.class === 'Chassis' ? 'Select Rack' : 'Select Rack or Chassis'"
        :selectable="isSelectableContainer"
        :display-filter="isSelectableContainer"
        @update:model-value="onContainerChange"
      />
    </fieldset>

    <fieldset v-if="isRackContainer" class="form-fieldset" data-test="rack-fields">
      <legend>Rack Placement</legend>
      <div class="form-grid">
        <FormField
          label="Position"
          hint="Rack unit, as the rack numbers it"
          v-slot="{ id, describedBy }"
        >
          <InputNumber
            :input-id="id"
            :aria-describedby="describedBy"
            :model-value="placement.position"
            :min="positionBounds.min"
            :max="positionBounds.max"
            show-buttons
            @update:model-value="placement.position = $event ?? positionBounds.min"
          />
        </FormField>
        <FormField label="Height (U)" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            :model-value="placement.height"
            :min="1"
            :max="rackHeight"
            show-buttons
            @update:model-value="placement.height = $event || 1"
          />
        </FormField>
        <FormField label="Orientation" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.orientation"
            :options="RACK_ORIENTATIONS"
            option-label="label"
            option-value="value"
            @update:model-value="placement.orientation = $event"
          />
        </FormField>
      </div>

      <Message v-if="extentWarning" severity="warn" :closable="false" data-test="extent-warning">
        {{ extentWarning }}
      </Message>

      <!-- ImagePickerButton has no disabled prop, so the face that is not drawn is omitted. -->
      <div class="form-grid mt-sm">
        <FormField v-if="placement.orientation !== 2" label="Front image" group>
          <ImagePickerButton
            :model-value="placement.imageFront"
            label="Select front image"
            @update:model-value="placement.imageFront = $event"
          />
        </FormField>
        <FormField v-if="placement.orientation !== 1" label="Rear image" group>
          <ImagePickerButton
            :model-value="placement.imageRear"
            label="Select rear image"
            @update:model-value="placement.imageRear = $event"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset v-else-if="isChassisContainer" class="form-fieldset" data-test="chassis-fields">
      <legend>Chassis Placement</legend>
      <FormField label="Image" group>
        <ImagePickerButton
          :model-value="placement.chassisPlacement?.image ?? null"
          label="Select image"
          @update:model-value="chassisField('image', $event)"
        />
      </FormField>
      <div class="form-grid">
        <FormField label="Height" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            :model-value="placement.chassisPlacement?.height ?? 1"
            :min="0"
            @update:model-value="chassisField('height', $event ?? 0)"
          />
        </FormField>
        <FormField label="Height units" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.chassisPlacement?.heightUnits ?? 0"
            :options="VERTICAL_UNITS"
            option-label="label"
            option-value="value"
            @update:model-value="chassisField('heightUnits', $event)"
          />
        </FormField>
        <FormField label="Width" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            :model-value="placement.chassisPlacement?.width ?? 1"
            :min="0"
            @update:model-value="chassisField('width', $event ?? 0)"
          />
        </FormField>
        <FormField label="Width units" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.chassisPlacement?.widthUnits ?? 0"
            :options="HORIZONTAL_UNITS"
            option-label="label"
            option-value="value"
            @update:model-value="chassisField('widthUnits', $event)"
          />
        </FormField>
        <FormField label="Vertical position" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            :model-value="placement.chassisPlacement?.positionHeight ?? 0"
            :min="0"
            @update:model-value="chassisField('positionHeight', $event ?? 0)"
          />
        </FormField>
        <FormField label="Vertical units" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.chassisPlacement?.positionHeightUnits ?? 0"
            :options="VERTICAL_UNITS"
            option-label="label"
            option-value="value"
            @update:model-value="chassisField('positionHeightUnits', $event)"
          />
        </FormField>
        <FormField label="Horizontal position" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            :model-value="placement.chassisPlacement?.positionWidth ?? 0"
            :min="0"
            @update:model-value="chassisField('positionWidth', $event ?? 0)"
          />
        </FormField>
        <FormField label="Horizontal units" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.chassisPlacement?.positionWidthUnits ?? 0"
            :options="HORIZONTAL_UNITS"
            option-label="label"
            option-value="value"
            @update:model-value="chassisField('positionWidthUnits', $event)"
          />
        </FormField>
        <FormField label="Orientation" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="placement.chassisPlacement?.orientation ?? 1"
            :options="CHASSIS_ORIENTATIONS"
            option-label="label"
            option-value="value"
            @update:model-value="chassisField('orientation', $event)"
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.rack-chassis-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-grid.mt-sm {
  margin-top: 0.5rem;
}
</style>
