<script setup>
import { mapIconMaskId } from '@/utils/networkMapNodePaint'

/**
 * `<mask>` definitions for glyph-style custom icons, one per image. Alpha masks, since glyphs
 * are usually black on transparent and a luminance mask would hide them.
 */
defineProps({
  /** `{ guid, url }` of each glyph-style image in use. */
  icons: { type: Array, required: true },
  prefix: { type: String, required: true },
})
</script>

<template>
  <defs>
    <mask
      v-for="icon in icons"
      :id="mapIconMaskId(prefix, icon.guid)"
      :key="icon.guid"
      maskContentUnits="objectBoundingBox"
      style="mask-type: alpha"
    >
      <image
        :href="icon.url"
        x="0"
        y="0"
        width="1"
        height="1"
        preserveAspectRatio="xMidYMid meet"
      />
    </mask>
  </defs>
</template>
