<script setup>
/**
 * One boxed link label in the map's SVG overlay, with geometry precomputed in box-local
 * coordinates. Arrows take the text colour: FORWARD / REVERSE follow the link's arbitrary
 * element order, so a colour would suggest a meaning.
 */
defineProps({
  box: { type: Object, required: true },
  fontSize: { type: Number, required: true },
  /** Drawn in the top layer, emphasized and faded in. */
  promoted: { type: Boolean, default: false },
  /** MF_TRANSLUCENT_LABEL_BKGND; clear fills a solid plate under the tint. */
  translucent: { type: Boolean, default: true },
})
</script>

<template>
  <g
    class="link-label"
    :class="{ 'link-label--promoted': promoted, 'link-label--opaque': !translucent }"
    :transform="`translate(${box.x - box.width / 2}, ${box.y - box.height / 2})`"
  >
    <rect :width="box.width" :height="box.height" rx="6" ry="6" class="link-label-box" />
    <template v-for="(line, i) in box.lines" :key="i">
      <template v-for="(segment, k) in line.segments" :key="k">
        <template v-if="segment.arrow">
          <line
            :x1="segment.arrow.shaft.x1"
            :y1="segment.arrow.shaft.y1"
            :x2="segment.arrow.shaft.x2"
            :y2="segment.arrow.shaft.y2"
            class="link-label-arrow-shaft"
          />
          <polygon :points="segment.arrow.head" class="link-label-arrow-head" />
        </template>
        <text
          :x="segment.x"
          :y="line.textY"
          :font-size="fontSize"
          :font-weight="segment.weight"
          font-family="inherit"
          dominant-baseline="hanging"
          class="link-label-text"
        >
          {{ segment.text }}
        </text>
      </template>
    </template>
  </g>
</template>

<style scoped>
.link-label {
  pointer-events: none;
  user-select: none;
}

.link-label-box {
  fill: var(--p-surface-0);
  stroke: var(--p-surface-400);
  stroke-width: 0.75;
  stroke-dasharray: 2 2;
  fill-opacity: 0.92;
}

html.app-dark .link-label-box {
  fill: var(--p-surface-800);
  stroke: var(--p-surface-500);
}

.link-label-text {
  fill: var(--p-text-color);
}

.link-label-arrow-shaft {
  stroke: var(--p-text-color);
  stroke-width: 1.7;
  stroke-linecap: round;
}

.link-label-arrow-head {
  fill: var(--p-text-color);
}

.link-label--opaque .link-label-box {
  fill-opacity: 1;
}

.link-label--promoted .link-label-box {
  stroke: var(--p-primary-color);
  stroke-dasharray: none;
  fill-opacity: 1;
}
</style>
