<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Slider from 'primevue/slider'
import FormField from '@/components/common/FormField.vue'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'

const props = defineProps({
  /** `reactive(useFloorPlanEditor(...))`, in backdrop mode */
  editor: { type: Object, required: true },
  /** The backdrop as drawn (`backdropRect` plus `url`); null until the image has loaded */
  backdrop: { type: Object, default: null },
  /** `{ points: [{x, y}], missed }` while calibrating; `missed` after a click off the image */
  calibration: { type: Object, default: null },
  /** 0.1 - 1 */
  opacity: { type: Number, required: true },
})

const emit = defineEmits([
  'done',
  'change-image',
  'fit',
  'calibrate',
  'calibrate-cancel',
  'calibrate-apply',
  'update:opacity',
])

const room = computed(() => props.editor.working?.room ?? {})
const hasImage = computed(() => !!room.value.backgroundImage)

/** Millimetres per image pixel as shown: three decimals. */
const shownScale = (mm) => Math.round(mm * 1000) / 1000

// Fields edit a draft and reach the plan on blur or Enter, one undo step each.
const draft = reactive({ mmPerPixel: null, x: 0, y: 0 })
watch(
  () => [props.backdrop?.mmPerPixel, room.value.backgroundX, room.value.backgroundY],
  ([mm, x, y]) => {
    draft.mmPerPixel = mm == null ? null : shownScale(mm)
    draft.x = x ?? 0
    draft.y = y ?? 0
  },
  { immediate: true },
)

function commitScale() {
  // InputNumber writes its model after the blur event.
  nextTick(() => {
    const mm = draft.mmPerPixel
    // An uncalibrated image shows its stretch; leaving the field unchanged must not calibrate it.
    if (!(mm > 0) || !props.backdrop || mm === shownScale(props.backdrop.mmPerPixel)) return
    props.editor.updateRoom({ backgroundScale: Math.max(1, Math.round(mm * 1000)) })
  })
}

function commitPosition(field, roomField) {
  nextTick(() => {
    const value = draft[field]
    if (value == null) return
    props.editor.updateRoom({ [roomField]: Math.round(value) })
  })
}

function blurOnEnter(event) {
  if (event.target?.blur) event.target.blur()
}

const opacityPercent = computed({
  get: () => Math.round(props.opacity * 100),
  set: (value) => emit('update:opacity', value / 100),
})

const step = computed(() => (props.editor.grid ? 'a tile' : '100 mm'))

const distance = ref(null)
const distanceRef = ref(null)
const points = computed(() => props.calibration?.points ?? [])
const measured = computed(() => {
  const [a, b] = points.value
  return a && b ? Math.round(Math.hypot(b.x - a.x, b.y - a.y)) : null
})

// Starts at the length as drawn, so Apply without typing leaves the image as it is.
watch(
  () => points.value.length,
  (count) => {
    if (count !== 2) return
    distance.value = measured.value
    nextTick(() => {
      const input = distanceRef.value?.querySelector('input')
      input?.focus()
      input?.select()
    })
  },
)

function applyCalibration() {
  nextTick(() => {
    if (distance.value === measured.value) emit('calibrate-cancel')
    else if (distance.value > 0) emit('calibrate-apply', distance.value)
  })
}

function onDistanceEnter(event) {
  blurOnEnter(event)
  applyCalibration()
}
</script>

<template>
  <div class="fp-backdrop-panel">
    <section class="fp-section">
      <h3 class="fp-section__title">Backdrop</h3>

      <FormField label="Image" group>
        <ImagePickerButton
          :model-value="room.backgroundImage"
          label="Select image"
          @update:model-value="(guid) => emit('change-image', guid)"
        />
      </FormField>

      <template v-if="hasImage">
        <!-- Enter in a field commits it, as leaving the field does. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div class="fp-fields" @keydown.enter="blurOnEnter">
          <FormField v-slot="{ id }" label="Scale, mm per image pixel" full-width>
            <InputNumber
              v-model="draft.mmPerPixel"
              :input-id="id"
              :use-grouping="false"
              :min="0.001"
              :min-fraction-digits="0"
              :max-fraction-digits="3"
              :disabled="!backdrop"
              size="small"
              fluid
              @blur="commitScale"
            />
          </FormField>
          <FormField v-slot="{ id }" label="X (mm)">
            <InputNumber
              v-model="draft.x"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commitPosition('x', 'backgroundX')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Y (mm)">
            <InputNumber
              v-model="draft.y"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commitPosition('y', 'backgroundY')"
            />
          </FormField>
        </div>
        <p v-if="!room.backgroundScale" class="fp-hint">
          Not calibrated: the image is stretched to the room's width. Calibrate it, or set the
          scale, to draw it true to size.
        </p>

        <FormField label="Opacity" group>
          <div class="fp-opacity">
            <Slider
              v-model="opacityPercent"
              :min="10"
              :max="100"
              :step="5"
              aria-label="Backdrop opacity"
              class="fp-opacity__slider"
            />
            <span class="fp-opacity__value">{{ opacityPercent }} %</span>
          </div>
        </FormField>

        <div class="fp-actions">
          <Button
            label="Calibrate"
            icon="pi pi-arrows-h"
            size="small"
            severity="secondary"
            outlined
            :disabled="!backdrop || !!calibration"
            @click="emit('calibrate')"
          />
          <Button
            v-tooltip.bottom="'Lay the image over the room, as wide as its outline'"
            label="Fit to room"
            icon="pi pi-expand"
            size="small"
            severity="secondary"
            outlined
            :disabled="!backdrop"
            @click="emit('fit')"
          />
        </div>

        <div v-if="calibration" class="fp-calibrate" aria-live="polite">
          <h4 class="fp-calibrate__title">Calibrate</h4>
          <template v-if="points.length < 2">
            <p class="fp-hint">
              Click both ends of something in the drawing whose real length you know, such as a
              wall or a dimension line ({{ points.length }} of 2).
            </p>
            <Message v-if="calibration.missed" severity="warn" size="small" :closable="false">
              That click was off the image. Pick points on the image itself.
            </Message>
          </template>
          <template v-else>
            <div ref="distanceRef">
              <FormField
                v-slot="{ id, describedBy }"
                label="Real length (mm)"
                :hint="`Measures ${measured} mm at the current scale`"
              >
                <InputNumber
                  v-model="distance"
                  :input-id="id"
                  :use-grouping="false"
                  :min="1"
                  :aria-describedby="describedBy"
                  size="small"
                  fluid
                  @keydown.enter="onDistanceEnter"
                />
              </FormField>
            </div>
          </template>
          <div class="fp-actions">
            <Button
              v-if="points.length === 2"
              label="Apply"
              icon="pi pi-check"
              size="small"
              @click="applyCalibration"
            />
            <Button
              label="Cancel"
              size="small"
              severity="secondary"
              text
              @click="emit('calibrate-cancel')"
            />
          </div>
        </div>

        <p class="fp-hint">
          Drag the image to move it, a corner to scale it. Arrows move it by {{ step }}, Alt+arrows
          by 10 mm. Saved with the plan.
        </p>
      </template>
      <p v-else class="fp-hint">
        Pick a drawing of the room to lay under the plan, then move and scale it to match the walls.
      </p>

      <div class="fp-actions">
        <Button label="Done" icon="pi pi-check" size="small" @click="emit('done')" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.fp-backdrop-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.fp-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.5rem 0.75rem;
}

.fp-fields :deep(.form-field--full) {
  grid-column: 1 / -1;
}

.fp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.fp-opacity {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding-inline: 0.375rem;
}

.fp-opacity__slider {
  flex: 1;
}

.fp-opacity__value {
  min-width: 3rem;
  text-align: end;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.fp-calibrate {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
}

.fp-calibrate__title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}
</style>
