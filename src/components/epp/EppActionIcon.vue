<script setup>
import { computed } from 'vue'
import {
  Activity,
  BellOff,
  BellRing,
  Boxes,
  CircleCheck,
  CirclePause,
  CirclePlay,
  Clock,
  Code,
  CornerDownRight,
  Database,
  FileCode,
  FileX,
  Gauge,
  MessageSquareText,
  OctagonX,
  ScrollText,
  Siren,
  Sparkles,
  Tag,
  Ticket,
  TimerOff,
  Zap,
} from 'lucide-vue-next'
import { STEP_KINDS } from '@/utils/eppRuleSummary'

defineOptions({ name: 'EppActionIcon' })

const props = defineProps({
  /** A `STEP_KINDS` key, or a `CONDITIONS` one for a rule editor condition section. */
  type: { type: String, required: true },
  /** On a tinted square, for step lists; bare for the collapsed row's strip. */
  tile: { type: Boolean, default: false },
  size: { type: Number, default: 15 },
  /** Grey, on an outlined tile: a rule editor section that does nothing yet. */
  muted: { type: Boolean, default: false },
})

const ICONS = {
  'alarm-generate': BellRing,
  'alarm-resolve': CircleCheck,
  'alarm-terminate': BellOff,
  incident: Siren,
  'helpdesk-ticket': Ticket,
  'ai-comment': MessageSquareText,
  'server-action': Zap,
  'action-script': FileCode,
  'ai-instructions': Sparkles,
  'timer-cancel': TimerOff,
  pstorage: Database,
  'custom-attributes': Tag,
  'downtime-start': CirclePause,
  'downtime-end': CirclePlay,
  'log-force': ScrollText,
  'log-disable': FileX,
  'chain-call': CornerDownRight,
  stop: OctagonX,
}

// In the color of the rule summary's Filter mark.
const CONDITIONS = {
  events: Activity,
  sources: Boxes,
  severity: Gauge,
  time: Clock,
  'filter-script': Code,
}

const icon = computed(() => ICONS[props.type] ?? CONDITIONS[props.type] ?? Zap)
const kind = computed(() => (CONDITIONS[props.type] ? 'when' : (STEP_KINDS[props.type] ?? 'run')))
</script>

<template>
  <span
    class="epp-action-icon"
    :class="[
      `epp-action-icon--${kind}`,
      { 'epp-action-icon--tile': tile, 'epp-action-icon--muted': muted },
    ]"
    aria-hidden="true"
  >
    <component :is="icon" :size="size" :stroke-width="1.9" />
  </span>
</template>

<style scoped>
/* Kind colors stay clear of the status palette, which means severity everywhere else. */
.epp-action-icon {
  --epp-kind-alarm: var(--p-pink-700, #be185d);
  --epp-kind-run: var(--p-indigo-700, #4338ca);
  --epp-kind-state: var(--p-teal-700, #0f766e);
  --epp-kind-flow: var(--p-slate-600, #475569);
  --epp-kind-stop: var(--p-red-600, #dc2626);

  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--epp-kind-color);
}

html.app-dark .epp-action-icon {
  --epp-kind-alarm: var(--p-pink-400, #f472b6);
  --epp-kind-run: var(--p-indigo-300, #a5b4fc);
  --epp-kind-state: var(--p-teal-300, #5eead4);
  --epp-kind-flow: var(--p-slate-300, #cbd5e1);
  --epp-kind-stop: var(--p-red-400, #f87171);
}

.epp-action-icon--alarm {
  --epp-kind-color: var(--epp-kind-alarm);
}

.epp-action-icon--run {
  --epp-kind-color: var(--epp-kind-run);
}

.epp-action-icon--state {
  --epp-kind-color: var(--epp-kind-state);
}

.epp-action-icon--flow {
  --epp-kind-color: var(--epp-kind-flow);
}

.epp-action-icon--stop {
  --epp-kind-color: var(--epp-kind-stop);
}

.epp-action-icon--when {
  --epp-kind-color: var(--p-primary-color);
}

.epp-action-icon--tile {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--epp-kind-color) 13%, var(--p-surface-card, transparent));
}

/* After the kind classes, which it overrides. */
.epp-action-icon--muted {
  --epp-kind-color: var(--p-text-muted-color);
}

.epp-action-icon--tile.epp-action-icon--muted {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--p-content-border-color);
}
</style>
