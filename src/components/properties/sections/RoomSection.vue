<script setup>
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import { GRID_LABEL_OPTIONS, LIMITS, ROOM_TYPE_OPTIONS } from '@/utils/dataCenterProperties'

const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const room = computed(() => props.draft.room)
const noGrid = computed(() => !room.value.gridTileSize)

const areaText = computed(() => {
  const area = props.object.room?.area
  if (area == null) return ''
  return `${area.toFixed(1)} m²`
})
</script>

<template>
  <div class="data-center-section">
    <fieldset class="form-fieldset">
      <legend>Room</legend>
      <div class="form-fields">
        <FormField label="Room type" v-slot="{ id }">
          <Select
            v-model="room.roomType"
            :input-id="id"
            :options="ROOM_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="select-input"
          />
        </FormField>
        <FormField label="Height" hint="0 = not declared" v-slot="{ id, describedBy }">
          <div class="number-row">
            <InputNumber
              v-model="room.height"
              :input-id="id"
              :min="LIMITS.roomHeight.min"
              :max="LIMITS.roomHeight.max"
              :allow-empty="false"
              :aria-describedby="describedBy"
              class="number-input"
            />
            <span class="unit">mm</span>
          </div>
        </FormField>
        <FormField v-if="areaText" label="Floor area" group>
          <div class="form-value">{{ areaText }}</div>
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Floor Tiles</legend>
      <div class="form-fields">
        <FormField label="Tile size" hint="0 = no tile grid" v-slot="{ id, describedBy }">
          <div class="number-row">
            <InputNumber
              v-model="room.gridTileSize"
              :input-id="id"
              :min="LIMITS.tileSize.min"
              :max="LIMITS.tileSize.max"
              :allow-empty="false"
              :aria-describedby="describedBy"
              class="number-input"
            />
            <span class="unit">mm</span>
          </div>
        </FormField>
        <FormField label="Tile labels" v-slot="{ id }">
          <Select
            v-model="room.gridLabels"
            :input-id="id"
            :options="GRID_LABEL_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="noGrid"
            class="select-input"
          />
        </FormField>
        <div class="form-row">
          <FormField label="Grid origin X" v-slot="{ id }">
            <div class="number-row">
              <InputNumber
                v-model="room.gridOriginX"
                :input-id="id"
                :min="LIMITS.gridOrigin.min"
                :max="LIMITS.gridOrigin.max"
                :allow-empty="false"
                :disabled="noGrid"
                class="number-input"
              />
              <span class="unit">mm</span>
            </div>
          </FormField>
          <FormField label="Grid origin Y" v-slot="{ id }">
            <div class="number-row">
              <InputNumber
                v-model="room.gridOriginY"
                :input-id="id"
                :min="LIMITS.gridOrigin.min"
                :max="LIMITS.gridOrigin.max"
                :allow-empty="false"
                :disabled="noGrid"
                class="number-input"
              />
              <span class="unit">mm</span>
            </div>
          </FormField>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Floor Plan</legend>
      <div class="form-fields">
        <FormField label="Background image" group>
          <ImagePickerButton v-model="room.backgroundImage" label="Select image" />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style src="./dataCenterSection.css" scoped />
