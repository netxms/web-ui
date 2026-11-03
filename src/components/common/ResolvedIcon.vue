<script setup>
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { iconHalo } from '@/utils/iconImageAnalysis'

/**
 * Draws a resolved icon (`useObjectIcons`): a Lucide component, a library image as a glyph (a
 * mask painted in the current colour) or as a picture (its own colours). The root is the
 * svg/span/img itself, so classes and styles fall through.
 */
const props = defineProps({
  /**
   * `{ kind: 'builtin', component }` or `{ kind: 'glyph'|'picture', url, analysis }`.
   * @type {import('vue').PropType<object>}
   */
  icon: { type: Object, required: true },
  /** px number or any CSS length. */
  size: { type: [Number, String], default: '1em' },
  strokeWidth: { type: [Number, String], default: 1.75 },
  /** A picture cannot take the caller's colour, so it is greyed here. */
  inactive: { type: Boolean, default: false },
})

const { isDark } = useTheme()

const box = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))

const pictureFilter = computed(() => {
  if (props.icon.kind !== 'picture') return undefined
  const filters = []
  const halo = iconHalo(props.icon.analysis, isDark.value)
  if (halo === 'light') filters.push('drop-shadow(0 0 1px rgb(255 255 255 / 0.85))')
  if (halo === 'dark') filters.push('drop-shadow(0 0 1px rgb(0 0 0 / 0.7))')
  if (props.inactive) filters.push('grayscale(1)', 'opacity(0.55)')
  return filters.length ? filters.join(' ') : undefined
})
</script>

<template>
  <span
    v-if="icon.kind === 'glyph'"
    class="resolved-icon resolved-icon--glyph"
    :style="{ '--resolved-icon-size': box, '--resolved-icon-mask': `url('${icon.url}')` }"
    aria-hidden="true"
  />
  <img
    v-else-if="icon.kind === 'picture'"
    class="resolved-icon resolved-icon--picture"
    :src="icon.url"
    :style="{ '--resolved-icon-size': box, filter: pictureFilter }"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
  <component
    :is="icon.component"
    v-else
    class="resolved-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>

<style scoped>
.resolved-icon {
  flex-shrink: 0;
}

/* Lowest priority, like a Lucide icon's width/height attributes, so a caller's sizing class
   wins for every kind alike. */
:where(.resolved-icon--glyph, .resolved-icon--picture) {
  width: var(--resolved-icon-size);
  height: var(--resolved-icon-size);
}

.resolved-icon--glyph {
  display: inline-block;
  background-color: currentColor;
  -webkit-mask: var(--resolved-icon-mask) center / contain no-repeat;
  mask: var(--resolved-icon-mask) center / contain no-repeat;
}

.resolved-icon--picture {
  display: inline-block;
  object-fit: contain;
}
</style>
