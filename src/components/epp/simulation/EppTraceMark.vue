<script setup>
import { computed } from 'vue'
import { CircleCheck, CircleDashed, CircleSlash, LogIn, OctagonX } from 'lucide-vue-next'

// Dev only: what a simulated event did at one rule row or chain tab.
defineOptions({ name: 'EppTraceMark' })

const props = defineProps({
  /**
   * Rule: `{ outcome, reason, count, stops }`. Chain: `{ entries }`, or null when the event did
   * not enter it.
   */
  mark: { type: Object, default: null },
  kind: { type: String, default: 'rule' },
})

const RULE_LOOK = {
  matched: { icon: CircleCheck, label: 'Matched' },
  skipped: { icon: CircleSlash, label: 'Skipped' },
  'not-reached': { icon: CircleDashed, label: 'Not reached' },
}

const look = computed(() => RULE_LOOK[props.mark?.outcome] ?? null)

const ruleTip = computed(() => {
  if (!look.value) return ''
  const parts = [`${look.value.label} by the simulated event`]
  if (props.mark.count > 1) parts[0] += ` (${props.mark.count} visits)`
  if (props.mark.reason) parts.push(props.mark.reason)
  return parts.join(': ')
})

const chainTip = computed(() => {
  if (!props.mark) return 'The simulated event does not enter this chain'
  return props.mark.entries > 1
    ? `The simulated event enters this chain ${props.mark.entries} times`
    : 'The simulated event enters this chain'
})
</script>

<template>
  <span
    v-if="kind === 'chain'"
    v-tooltip.bottom="chainTip"
    class="epp-trace-mark"
    :class="mark ? 'epp-trace-mark--chain-entered' : 'epp-trace-mark--chain-missed'"
    role="img"
    :aria-label="chainTip"
  >
    <LogIn v-if="mark" :size="13" aria-hidden="true" />
    <CircleDashed v-else :size="13" aria-hidden="true" />
    <span v-if="mark?.entries > 1" class="epp-trace-mark__count">{{ mark.entries }}×</span>
  </span>

  <span v-else-if="look" class="epp-trace-mark" :class="`epp-trace-mark--${mark.outcome}`">
    <span v-tooltip.bottom="ruleTip" class="epp-trace-mark__pill" role="img" :aria-label="ruleTip">
      <component :is="look.icon" :size="12" aria-hidden="true" />
      <span class="epp-trace-mark__label" aria-hidden="true">{{ look.label }}</span>
      <span v-if="mark.count > 1" class="epp-trace-mark__count" aria-hidden="true">
        ×{{ mark.count }}
      </span>
    </span>
    <OctagonX
      v-if="mark.stops"
      v-tooltip.bottom="'Stops processing'"
      :size="14"
      class="epp-trace-mark__stop"
      aria-label="Stops processing"
    />
    <span v-if="mark.reason" class="epp-trace-mark__reason" aria-hidden="true">
      {{ mark.reason }}
    </span>
  </span>
</template>

<style scoped>
.epp-trace-mark {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  flex: 0 1 auto;
  font-size: 0.75rem;
  font-weight: 400;
}

.epp-trace-mark__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0 0.4rem;
  line-height: 1.25rem;
  border-radius: 0.625rem;
  border: 1px solid transparent;
  white-space: nowrap;
}

.epp-trace-mark--matched .epp-trace-mark__pill {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  font-weight: 600;
}

.epp-trace-mark--skipped .epp-trace-mark__pill {
  background: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
}

.epp-trace-mark--not-reached .epp-trace-mark__pill {
  border-style: dashed;
  border-color: var(--p-content-border-color);
  color: var(--p-text-muted-color);
}

.epp-trace-mark__count {
  font-variant-numeric: tabular-nums;
}

.epp-trace-mark__stop {
  flex-shrink: 0;
  color: var(--p-red-600, #dc2626);
}

html.app-dark .epp-trace-mark__stop {
  color: var(--p-red-400, #f87171);
}

.epp-trace-mark__reason {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--p-text-muted-color);
  font-style: italic;
}

/* The table's own narrow breakpoint: the icon stays, the words move to the tooltip. */
@container (max-width: 48rem) {
  .epp-trace-mark__label,
  .epp-trace-mark__reason {
    display: none;
  }
}

.epp-trace-mark--chain-entered {
  color: var(--p-primary-color);
  font-weight: 600;
  gap: 0.125rem;
}

.epp-trace-mark--chain-missed {
  color: var(--p-text-muted-color);
}
</style>

<!-- Unscoped: the mark sits inside the row or tab it dims. -->
<style>
.epp-table tbody tr:has(.epp-trace-mark--not-reached) > td {
  opacity: 0.55;
}

/* The rule's name keeps priority over the reason beside it. */
.rule-description-cell:has(.epp-trace-mark) .rule-comments {
  flex-shrink: 0;
  max-width: 70%;
}

.chain-tab:not(.active):has(.epp-trace-mark--chain-missed) {
  opacity: 0.65;
}
</style>
