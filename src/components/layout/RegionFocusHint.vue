<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { hasFilterField } from '@/composables/useFilterShortcut'

// Names the pane F6 just moved to. Teleported and `fixed` so it never affects layout, and
// `aria-hidden` because focusing a landmark already announces it to screen readers.

const props = defineProps({
  /** @type {{ element: HTMLElement, label: string } | null} */
  region: { type: Object, default: null },
})

const GAP = 8

const filterHint = computed(() =>
  props.region && hasFilterField(props.region.element) ? ', / to filter' : '',
)

const pill = ref(null)
const position = ref(null)

// Viewport coordinates. Centred on the pane when it fits, otherwise beside it (the nav rail is
// too narrow), against whichever inner edge faces the rest of the window.
function place() {
  if (!props.region || !pill.value) {
    position.value = null
    return
  }
  const rect = props.region.element.getBoundingClientRect()
  const width = pill.value.offsetWidth
  const viewport = window.innerWidth

  let left
  if (width + GAP * 2 <= rect.width) {
    left = rect.left + (rect.width - width) / 2
  } else if (rect.left + rect.width / 2 < viewport / 2) {
    left = rect.right + GAP
  } else {
    left = rect.left - GAP - width
  }

  // A pane can be narrow *and* against the window edge; this is the backstop for that.
  left = Math.min(Math.max(left, GAP), Math.max(GAP, viewport - width - GAP))
  position.value = { left: `${left}px`, top: `${rect.bottom - 12}px` }
}

// `post` so the pill carries the new label before it is measured. No re-measure needed:
// `useRegionFocus` retires the hint on scroll and resize.
onMounted(place)
watch(() => props.region, place, { flush: 'post' })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="region"
      ref="pill"
      class="region-focus-hint"
      :style="position ?? { visibility: 'hidden' }"
      aria-hidden="true"
    >
      {{ region.label }} - F6 next pane, Shift+F6 previous, Tab to enter{{ filterHint }}
    </div>
  </Teleport>
</template>

<style scoped>
.region-focus-hint {
  position: fixed;
  /* Under ReconnectingToast, over AiChatPanel. */
  z-index: 940;
  transform: translateY(-100%);
  pointer-events: none;
  max-width: min(90vw, 26rem);
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--p-primary-color);
  border-radius: 999px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  animation: region-focus-hint-in 120ms ease-out;
}

@keyframes region-focus-hint-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .region-focus-hint {
    animation: none;
  }
}
</style>
