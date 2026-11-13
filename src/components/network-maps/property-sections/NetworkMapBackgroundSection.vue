<script setup>
import { computed, inject } from 'vue'
import RadioButton from 'primevue/radiobutton'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Button from 'primevue/button'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import {
  MAP_BACKGROUND_FIT_MODES,
  backgroundFitModeFromFlags,
  flagsWithBackgroundFitMode,
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

const FIT_MODE_OPTIONS = [
  { label: 'Native size', value: MAP_BACKGROUND_FIT_MODES.NATIVE },
  { label: 'Center', value: MAP_BACKGROUND_FIT_MODES.CENTER },
  { label: 'Fit to area', value: MAP_BACKGROUND_FIT_MODES.FIT },
]

// Stored as MF_* flag bits, not a dedicated field.
const fitMode = computed({
  get: () => backgroundFitModeFromFlags(props.draft.flags),
  set: (mode) => {
    props.draft.flags = flagsWithBackgroundFitMode(props.draft.flags, mode)
  },
})

const imageUsesArea = computed(() => fitMode.value !== MAP_BACKGROUND_FIT_MODES.NATIVE)

const adjust = inject('mapBackdropAdjust', null)

const adjustHint = computed(() => {
  if (props.draft.backgroundType === 'geo') {
    return adjust?.active
      ? 'Drag the map to move it and scroll over it to zoom; drag the right or bottom edge, or the corner, to size it.'
      : 'Place the map on the map itself instead of typing coordinates and sizes.'
  }
  if (!adjust?.active) return 'Size the image area on the map itself instead of typing numbers.'
  return fitMode.value === MAP_BACKGROUND_FIT_MODES.FIT
    ? "Drag the right or bottom edge, or the corner, on the map. The corner keeps the image's proportions; hold Shift to stretch it."
    : 'Drag the right or bottom edge, or the corner, on the map to size the area the image is centered in.'
})
</script>

<template>
  <div class="network-map-background-section">
    <fieldset class="form-fieldset">
      <legend>Background</legend>
      <div class="form-fields">
        <div class="prop-inline">
          <RadioButton v-model="draft.backgroundType" input-id="bg-none" value="none" />
          <label for="bg-none">None</label>
        </div>
        <div class="prop-inline">
          <RadioButton v-model="draft.backgroundType" input-id="bg-image" value="image" />
          <label for="bg-image">Image</label>
        </div>
        <div class="prop-inline">
          <RadioButton v-model="draft.backgroundType" input-id="bg-geo" value="geo" />
          <label for="bg-geo">Geographic map</label>
        </div>

        <template v-if="draft.backgroundType === 'image'">
          <FormField label="Background image" group>
            <ImagePickerButton v-model="draft.backgroundImage" label="Select image" />
          </FormField>
          <FormField label="Placement" v-slot="{ id }">
            <Select
              :input-id="id"
              v-model="fitMode"
              :options="FIT_MODE_OPTIONS"
              option-label="label"
              option-value="value"
            />
          </FormField>
          <template v-if="imageUsesArea">
            <div class="form-row">
              <FormField label="Image area width" v-slot="{ id }">
                <div class="number-row">
                  <InputNumber
                    :input-id="id"
                    v-model="draft.width"
                    :min="0"
                    :max="10000"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </FormField>
              <FormField label="Image area height" v-slot="{ id }">
                <div class="number-row">
                  <InputNumber
                    :input-id="id"
                    v-model="draft.height"
                    :min="0"
                    :max="10000"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </FormField>
            </div>
            <small class="field-hint">
              The image is
              {{ fitMode === MAP_BACKGROUND_FIT_MODES.FIT ? 'stretched to' : 'centered within' }}
              this area. Nodes are placed freely and are not clipped to it.
            </small>
          </template>
          <small v-else class="field-hint">
            At native size the image sits at the map's top left corner. Choose Center or Fit to
            area to size it on the map.
          </small>
        </template>

        <template v-if="draft.backgroundType === 'geo'">
          <div class="form-row">
            <FormField label="Latitude" v-slot="{ id }">
              <InputNumber
                :input-id="id"
                v-model="draft.backgroundLatitude"
                :min-fraction-digits="0"
                :max-fraction-digits="8"
                class="number-input"
              />
            </FormField>
            <FormField label="Longitude" v-slot="{ id }">
              <InputNumber
                :input-id="id"
                v-model="draft.backgroundLongitude"
                :min-fraction-digits="0"
                :max-fraction-digits="8"
                class="number-input"
              />
            </FormField>
          </div>
          <FormField label="Zoom" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="draft.backgroundZoom"
              :min="0"
              :max="20"
              show-buttons
              class="number-input"
            />
          </FormField>
          <div class="form-row">
            <FormField label="Map area width" v-slot="{ id }">
              <div class="number-row">
                <InputNumber
                  :input-id="id"
                  v-model="draft.width"
                  :min="0"
                  :max="10000"
                  class="number-input"
                />
                <span class="unit">px</span>
              </div>
            </FormField>
            <FormField label="Map area height" v-slot="{ id }">
              <div class="number-row">
                <InputNumber
                  :input-id="id"
                  v-model="draft.height"
                  :min="0"
                  :max="10000"
                  class="number-input"
                />
                <span class="unit">px</span>
              </div>
            </FormField>
          </div>
          <small class="field-hint">
            The static map fills this area, centered on the coordinates above.
          </small>
        </template>

        <div
          v-if="
            adjust &&
            (draft.backgroundType === 'geo' || (draft.backgroundType === 'image' && imageUsesArea))
          "
          class="form-field"
        >
          <Button
            :label="adjust.active ? 'Done adjusting' : 'Adjust on map'"
            :icon="adjust.active ? 'pi pi-check' : 'pi pi-arrows-alt'"
            size="small"
            :outlined="!adjust.active"
            :severity="adjust.active ? 'primary' : 'secondary'"
            :aria-pressed="adjust.active"
            @click="adjust.toggle()"
          />
          <small class="field-hint">{{ adjustHint }}</small>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Background color</legend>
      <div class="form-fields">
        <FormField label="Background color" group>
          <ColorPickerField v-model="draft.backgroundColor" />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-background-section {
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

/* Fixed-width number fields with their unit, as in the object property sections. */
.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.75rem;
}

.number-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.number-input {
  width: 10rem;
  flex-shrink: 0;
}

:deep(.number-input input) {
  max-width: 100%;
}

.unit {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.field-hint {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
</style>
