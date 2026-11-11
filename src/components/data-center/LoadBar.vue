<script setup>
import { computed } from 'vue'

/** The bar runs to this multiple of the rating, so a load over it still shows how far over. */
const BAR_SCALE = 1.25

const props = defineProps({
  /** Load against the rating; null without a value */
  ratio: { type: Number, default: null },
  /** Without a rating there is nothing to draw against: the bar stays blank. */
  rated: { type: Boolean, default: true },
  /** No supply at all, as with a feed lost */
  offline: { type: Boolean, default: false },
  label: { type: String, required: true },
})

const fill = computed(() =>
  props.ratio == null ? 0 : (Math.min(props.ratio, 1) / BAR_SCALE) * 100,
)
const over = computed(() =>
  props.ratio != null && props.ratio > 1
    ? ((Math.min(props.ratio, BAR_SCALE) - 1) / BAR_SCALE) * 100
    : 0,
)
</script>

<template>
  <div
    v-if="rated"
    class="load-bar"
    :class="{ 'load-bar--off': offline }"
    role="img"
    :aria-label="label"
  >
    <div class="load-bar__fill" :style="{ width: `${fill}%` }" />
    <div
      v-if="over"
      class="load-bar__over"
      :style="{ left: `${100 / BAR_SCALE}%`, width: `${over}%` }"
    />
    <div class="load-bar__rating" :style="{ left: `calc(${100 / BAR_SCALE}% - 1px)` }" />
  </div>
  <div v-else class="load-bar load-bar--none" />
</template>

<style scoped>
.load-bar {
  position: relative;
  height: 0.875rem;
  border-radius: 2px;
  background: color-mix(in srgb, var(--p-text-color) 8%, var(--p-content-background));
}

.load-bar--none {
  background: none;
}

.load-bar--off {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--p-text-color) 14%, var(--p-content-background)) 0 3px,
    transparent 3px 7px
  );
}

.load-bar__fill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  border-radius: 2px 0 0 2px;
  background: color-mix(in srgb, var(--p-text-color) 42%, var(--p-content-background));
  transition: width 0.25s ease;
}

.load-bar__over {
  position: absolute;
  inset-block: 0;
  background: repeating-linear-gradient(
    135deg,
    var(--netxms-status-minor) 0 4px,
    transparent 4px 7px
  );
  border: 1px solid var(--netxms-status-minor);
}

.load-bar__rating {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--p-text-color);
}

@media (prefers-reduced-motion: reduce) {
  .load-bar__fill {
    transition: none;
  }
}
</style>
