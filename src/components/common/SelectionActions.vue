<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Tooltip from 'primevue/tooltip'
import { useElementSize } from '@/composables/useElementSize'

/**
 * A table's selection actions in the view's toolbar row. It holds the space between the
 * toolbar's groups whether or not anything is selected. Labelled buttons drop to icons with
 * tooltips when they do not fit; while something is selected it never gets narrower than the
 * icon row, so a toolbar that can wrap does rather than clipping the actions.
 */
const props = defineProps({
  count: { type: Number, required: true },
  /**
   * `{ label, icon, command?(event), href?, severity? }` each. `href` renders a real anchor;
   * `command` then handles the plain click.
   * @type {import('vue').PropType<Array<object>>}
   */
  actions: { type: Array, default: () => [] },
})

const emit = defineEmits(['clear'])

const vTooltip = Tooltip

const rootRef = ref(null)
const rowRef = ref(null)
const sizerRef = ref(null)
const { width } = useElementSize(rootRef)
const iconRowWidth = ref(0)

// The root's padding is part of its width.
const rootStyle = computed(() =>
  props.count && iconRowWidth.value ? { minWidth: `calc(${iconRowWidth.value}px + 0.5rem)` } : null,
)

const compact = ref(false)
// Measured the last time the row was shown with labels.
let labelledWidth = 0

const contentKey = computed(() => `${props.count}|${props.actions.map((a) => a.label).join('|')}`)

// Only the labelled row can be measured.
watch(contentKey, () => {
  compact.value = false
})

function fit() {
  iconRowWidth.value = sizerRef.value?.offsetWidth ?? 0
  if (!rowRef.value || !width.value) return
  if (!compact.value) labelledWidth = rowRef.value.offsetWidth
  compact.value = labelledWidth > width.value
}

watch([width, contentKey, compact], fit, { flush: 'post' })
</script>

<template>
  <div ref="rootRef" class="selection-actions" :style="rootStyle">
    <div
      v-if="count"
      ref="rowRef"
      class="selection-actions__row"
      role="group"
      aria-label="Selection"
    >
      <span class="selection-actions__count">{{ count }} selected</span>
      <Button
        v-for="action in actions"
        :key="action.label"
        v-tooltip.bottom="compact ? action.label : null"
        :as="action.href ? 'a' : undefined"
        :href="action.href"
        :label="compact ? undefined : action.label"
        :aria-label="action.label"
        :icon="action.icon"
        size="small"
        :severity="action.severity ?? 'secondary'"
        outlined
        @click="action.command?.($event)"
      />
      <Button label="Clear" size="small" text severity="secondary" @click="emit('clear')" />
    </div>
    <div v-if="count" ref="sizerRef" class="selection-actions__sizer" aria-hidden="true" inert>
      <span class="selection-actions__count">{{ count }} selected</span>
      <Button
        v-for="action in actions"
        :key="action.label"
        :icon="action.icon"
        size="small"
        outlined
      />
      <Button label="Clear" size="small" text />
    </div>
  </div>
</template>

<style scoped>
/* Its width comes from the toolbar, not its content, so the content can be fitted to it. The
   padding, taken back by the margin, keeps focus rings inside the clip. */
.selection-actions {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  padding: 0.25rem;
  margin: -0.25rem;
}

.selection-actions__row,
.selection-actions__sizer {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: max-content;
}

.selection-actions__sizer {
  position: absolute;
  visibility: hidden;
}

.selection-actions__count {
  margin-right: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-primary-color);
  white-space: nowrap;
}
</style>
