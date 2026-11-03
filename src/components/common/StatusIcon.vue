<script setup>
import { computed } from 'vue'
import { STATUS_KEYS, getStatusInfo } from '@/utils/objectUtils'
import { STATUS_ICONS } from '@/utils/statusIcons'

// Shared by alarm severities and object statuses, so the same level looks the same everywhere.
const props = defineProps({
  /**
   * Status code (0-7; 0-4 double as severity) or palette key ('critical'). Anything else renders as
   * Unknown.
   */
  status: { type: [Number, String], default: 5 },
  /** The em default follows the surrounding font size, like an icon font. */
  size: { type: [Number, String], default: '1em' },
  /** 'text' inside a status chip, whose soft background would hide the fill (lemon on lemon). */
  tone: {
    type: String,
    default: 'fill',
    validator: (value) => value === 'fill' || value === 'text',
  },
})

const code = computed(() => {
  const value =
    typeof props.status === 'string'
      ? STATUS_KEYS.indexOf(props.status.toLowerCase())
      : props.status
  return STATUS_ICONS[value] ? value : 5
})

const color = computed(() => {
  const info = getStatusInfo(code.value)
  return props.tone === 'text' ? info.textColor : info.color
})
</script>

<template>
  <component
    :is="STATUS_ICONS[code]"
    class="status-icon"
    :size="size"
    :style="{ color, flexShrink: 0 }"
  />
</template>
