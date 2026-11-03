<script setup>
import { computed } from 'vue'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import MapFlagCheckbox from './MapFlagCheckbox.vue'
import {
  MAP_CANVAS_TYPE_LABELS,
  MAP_CANVAS_TYPE_GEOGRAPHICAL,
  MAP_OBJECT_DISPLAY_MODE_LABELS,
  MAP_INITIAL_VIEW_MODE_LABELS,
  MAP_OBJECT_DISPLAY_FLAGS,
  MAP_TOPOLOGY_FLAGS,
  MAP_FLAGS,
} from '@/utils/networkMapUtils'
import FormField from '@/components/common/FormField.vue'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const CANVAS_TYPE_OPTIONS = MAP_CANVAS_TYPE_LABELS.map((label, value) => ({ label, value }))
const DISPLAY_MODE_OPTIONS = MAP_OBJECT_DISPLAY_MODE_LABELS.map((label, value) => ({
  label,
  value,
}))
const VIEW_MODE_OPTIONS = MAP_INITIAL_VIEW_MODE_LABELS.map((label, value) => ({ label, value }))

const mapType = computed(() => props.object?.mapType ?? props.object?.rawContent?.mapType ?? 0)
const isTopologyMap = computed(() => mapType.value >= 1 && mapType.value <= 5)
const isGeoCanvas = computed(() => props.draft.canvasType === MAP_CANVAS_TYPE_GEOGRAPHICAL)

// The status icon/frame/background flags only apply in icon mode (as in the legacy client).
const isIconMode = computed(() => (props.draft.objectDisplayMode ?? 0) === 0)

function flagDisabled(flag) {
  return !!flag.iconOnly && !isIconMode.value
}
function flagHint(flag) {
  return flagDisabled(flag) ? 'Only applies when objects are displayed as icons.' : ''
}
</script>

<template>
  <div class="network-map-options-section">
    <fieldset class="form-fieldset">
      <legend>Display</legend>
      <div class="form-fields">
        <FormField label="Canvas type" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.canvasType"
            :options="CANVAS_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField label="Object display mode" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.objectDisplayMode"
            :options="DISPLAY_MODE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="isGeoCanvas" label="Initial view mode" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.initialViewMode"
            :options="VIEW_MODE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Object display options</legend>
      <div class="form-fields">
        <MapFlagCheckbox
          v-for="flag in MAP_OBJECT_DISPLAY_FLAGS"
          :key="flag.bit"
          :draft="draft"
          :bit="flag.bit"
          :label="flag.label"
          :disabled="flagDisabled(flag)"
          :hint="flagHint(flag)"
        />
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Object context</legend>
      <div class="form-fields">
        <MapFlagCheckbox
          :draft="draft"
          :bit="MAP_FLAGS.SHOW_AS_OBJECT_VIEW"
          label="Automatically show this map in object context"
        />
        <FormField label="Display priority" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="draft.displayPriority"
            :min="0"
            :max="65535"
            show-buttons
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset v-if="isTopologyMap" class="form-fieldset">
      <legend>Topology options</legend>
      <div class="form-fields">
        <MapFlagCheckbox
          v-for="flag in MAP_TOPOLOGY_FLAGS"
          :key="flag.bit"
          :draft="draft"
          :bit="flag.bit"
          :label="flag.label"
        />
        <div class="prop-inline">
          <Checkbox v-model="draft.useCustomRadius" input-id="opt-use-radius" :binary="true" />
          <label for="opt-use-radius">Use custom discovery radius</label>
        </div>
        <FormField label="Radius (hops)" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="draft.discoveryRadius"
            :min="1"
            :max="255"
            :disabled="!draft.useCustomRadius"
            show-buttons
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-options-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
</style>
