<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { getStatusInfo } from '@/utils/objectUtils'

// Use instead of <Tag :severity>: PrimeVue's severities cannot tell five levels apart and do not
// match the status dots, bars and maps.
const props = defineProps({
  /** Status code, or an alarm/event severity code (0-4). */
  status: { type: Number, default: 5 },
  /** Defaults to the status label. */
  value: { type: String, default: null },
})

const info = computed(() => getStatusInfo(props.status))
</script>

<template>
  <Tag :value="value ?? info.label" :style="{ background: info.bgColor, color: info.textColor }" />
</template>
