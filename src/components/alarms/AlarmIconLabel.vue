<script setup>
import { computed } from 'vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { getState, normalizeSeverity, severityLabels } from '@/utils/alarmDisplay'

// `collapsible` is for table cells: the label shows only while the cell is wide enough (CSS
// container query).
const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => value === 'severity' || value === 'state',
  },
  /** Raw severity/state as the API sends it (integer code or string). */
  value: { type: [Number, String], default: 0 },
  collapsible: { type: Boolean, default: false },
  /** Marks a sticky acknowledgment (state only). */
  sticky: { type: Boolean, default: false },
})

const display = computed(() => {
  if (props.type === 'state') return getState({ state: props.value, isSticky: props.sticky })
  // Unrecognized severities fall back to Normal, as getSeverity does.
  const key = normalizeSeverity(props.value)
  const known = key in severityLabels ? key : 'normal'
  return { key: known, label: severityLabels[known] }
})

// Collapsed cells need the label as a tooltip; a sticky ack explains its icon everywhere.
const tooltip = computed(
  () => display.value.hint ?? (props.collapsible ? display.value.label : null),
)
</script>

<template>
  <span
    class="alarm-icon-label"
    :class="[`alarm-icon-label--${type}`, { 'alarm-icon-label--collapsible': collapsible }]"
  >
    <span class="alarm-icon-label__inner">
      <!-- 1.5em is the line height: as big as the icon can get without making rows taller. -->
      <StatusIcon
        v-if="type === 'severity'"
        v-tooltip.top="tooltip"
        :status="display.key"
        size="1.5em"
      />
      <i v-else v-tooltip.top="tooltip" :class="display.icon" :style="{ color: display.color }" />
      <span class="alarm-icon-label__text">{{ display.label }}</span>
    </span>
  </span>
</template>

<style scoped>
/* One text line: the icon box is shorter, and rows would grow when the label appeared. */
.alarm-icon-label__inner {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  max-width: 100%;
  min-height: 1lh;
}

.alarm-icon-label__inner i {
  flex-shrink: 0;
  font-size: 1rem;
}

.alarm-icon-label__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The label appears once the widest label of its kind fits; em tracks the density. */
.alarm-icon-label--collapsible {
  display: block;
  width: 100%;
  container-type: inline-size;
}

/* Block flex: an inline box sits on a baseline, which shifts when the content changes. */
.alarm-icon-label--collapsible .alarm-icon-label__inner {
  display: flex;
}

.alarm-icon-label--collapsible .alarm-icon-label__text {
  display: none;
}

@container (min-width: 6em) {
  .alarm-icon-label--severity .alarm-icon-label__text {
    display: inline;
  }
}

@container (min-width: 8em) {
  .alarm-icon-label--state .alarm-icon-label__text {
    display: inline;
  }
}
</style>
