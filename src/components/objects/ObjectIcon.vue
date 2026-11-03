<script setup>
import { computed } from 'vue'
import ResolvedIcon from '@/components/common/ResolvedIcon.vue'
import { useObjectIcons } from '@/composables/useObjectIcons'
import { ICON_SURFACE, builtinIconComponent } from '@/utils/objectIcons'

/**
 * An object instance's icon: its custom image, or the built-in one. Class-level places use
 * `getClassIconComponent`. Colour comes from the caller's `color` as with a Lucide icon;
 * picture-style images keep their own colours.
 */
const props = defineProps({
  /** Anything with `class` and `category` (a map element works too). */
  object: { type: Object, default: null },
  /** An ICON_SURFACE value */
  surface: { type: String, default: ICON_SURFACE.SMALL },
  /** px number or any CSS length. */
  size: { type: [Number, String], default: '1em' },
  strokeWidth: { type: [Number, String], default: 1.75 },
  /** Greys a picture. */
  inactive: { type: Boolean, default: false },
})

const icons = useObjectIcons()

const resolved = computed(() =>
  icons
    ? icons.resolve(props.object, props.surface)
    : { kind: 'builtin', component: builtinIconComponent(props.object, props.surface) },
)
</script>

<template>
  <ResolvedIcon :icon="resolved" :size="size" :stroke-width="strokeWidth" :inactive="inactive" />
</template>
