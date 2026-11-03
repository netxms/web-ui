<script setup>
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { iconHalo } from '@/utils/iconImageAnalysis'
import { mapIconMaskId, mapNodeNeutrals } from '@/utils/networkMapNodePaint'

/**
 * One object node of the network map overlay. Takes a painted node (`paintMapNode`) rather
 * than an element because the custom icon preview shares it. Cytoscape keeps an invisible box
 * underneath for hit testing and link attachment.
 *
 * A picture icon cannot take the status tint, so a status dot is pinned to its corner instead
 * (as in the legacy client).
 */
const props = defineProps({
  /**
   * `{ x, y, visual, fill, boxStroke: { color, width }, cornerRadius, glyphColor,
   *   statusColor, dimmed, name, displayName, icon }`
   */
  node: { type: Object, required: true },
  /** Prefix of the `<mask>` ids the host defines for glyph-style images. */
  maskPrefix: { type: String, required: true },
})

const { isDark } = useTheme()
const neutrals = computed(() => mapNodeNeutrals(isDark.value))

const icon = computed(() => props.node.icon ?? { kind: 'builtin', component: null })

const iconBox = computed(() => {
  const glyph = props.node.visual.glyph
  if (!glyph) return null
  const size = icon.value.kind === 'picture' ? (glyph.pictureSize ?? glyph.size) : glyph.size
  return { x: glyph.x - size / 2, y: glyph.y - size / 2, size }
})

const iconOpacity = computed(() => (props.node.dimmed ? 0.3 : 0.85))

const pictureFilter = computed(() => {
  const halo = iconHalo(icon.value.analysis, isDark.value)
  if (halo === 'light') return 'drop-shadow(0 0 1px rgb(255 255 255 / 0.85))'
  if (halo === 'dark') return 'drop-shadow(0 0 1px rgb(0 0 0 / 0.7))'
  return undefined
})

const statusBadge = computed(() => {
  const box = iconBox.value
  if (!box || icon.value.kind !== 'picture' || !props.node.visual.glyph.useStatusColor) return null
  return { cx: box.x + box.size - 3, cy: box.y + 3 }
})
</script>

<template>
  <g :transform="`translate(${node.x}, ${node.y})`" style="pointer-events: none; user-select: none">
    <title v-if="node.name !== node.displayName">{{ node.name }}</title>
    <ellipse
      v-if="node.visual.shape === 'ellipse'"
      :rx="node.visual.width / 2"
      :ry="node.visual.height / 2"
      :fill="node.fill"
      :stroke="node.boxStroke.color"
      :stroke-width="node.boxStroke.width"
      :opacity="node.dimmed ? 0.15 : 1"
    />
    <rect
      v-else
      :x="-node.visual.width / 2"
      :y="-node.visual.height / 2"
      :width="node.visual.width"
      :height="node.visual.height"
      :rx="node.cornerRadius"
      :ry="node.cornerRadius"
      :fill="node.fill"
      :stroke="node.boxStroke.color"
      :stroke-width="node.boxStroke.width"
      :opacity="node.dimmed ? 0.15 : 1"
    />
    <template v-if="iconBox">
      <rect
        v-if="icon.kind === 'glyph'"
        :x="iconBox.x"
        :y="iconBox.y"
        :width="iconBox.size"
        :height="iconBox.size"
        :fill="node.glyphColor"
        :mask="`url(#${mapIconMaskId(maskPrefix, icon.guid)})`"
        :opacity="iconOpacity"
      />
      <image
        v-else-if="icon.kind === 'picture'"
        :href="icon.url"
        :x="iconBox.x"
        :y="iconBox.y"
        :width="iconBox.size"
        :height="iconBox.size"
        preserveAspectRatio="xMidYMid meet"
        :opacity="node.dimmed ? 0.3 : 1"
        :style="{ filter: pictureFilter }"
      />
      <component
        :is="icon.component"
        v-else-if="icon.component"
        :x="iconBox.x"
        :y="iconBox.y"
        :size="iconBox.size"
        :color="node.glyphColor"
        :stroke-width="1.75"
        :opacity="iconOpacity"
      />
      <circle
        v-if="statusBadge"
        :cx="statusBadge.cx"
        :cy="statusBadge.cy"
        r="5"
        :fill="node.statusColor"
        :stroke="neutrals.plateFill"
        stroke-width="1.5"
        :opacity="node.dimmed ? 0.3 : 1"
      />
    </template>
    <rect
      v-if="node.visual.plate"
      :x="node.visual.plate.x"
      :y="node.visual.plate.y"
      :width="node.visual.plate.width"
      :height="node.visual.plate.height"
      :rx="node.visual.plate.rx"
      :ry="node.visual.plate.rx"
      :fill="neutrals.plateFill"
      :stroke="neutrals.plateStroke"
      stroke-width="0.5"
      :opacity="node.dimmed ? 0.2 : 1"
    />
    <text
      v-for="(line, i) in node.visual.textLines"
      :key="i"
      :x="line.x"
      :y="line.y"
      :font-size="line.size"
      :font-weight="line.weight ?? 400"
      font-family="inherit"
      :text-anchor="line.anchor"
      :dominant-baseline="line.baseline"
      :fill="node.dimmed ? '#94a3b8' : neutrals.text"
      :fill-opacity="node.dimmed ? 0.4 : line.muted ? 0.7 : 1"
    >
      {{ line.text }}
    </text>
  </g>
</template>
