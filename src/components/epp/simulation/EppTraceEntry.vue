<script setup>
import { computed, ref } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  CornerDownRight,
  FileQuestion,
  OctagonX,
  Repeat,
  Unlink,
} from 'lucide-vue-next'
import EppActionIcon from '@/components/epp/EppActionIcon.vue'
import { STEP_TITLES } from '@/utils/eppRuleSummary'
import { EFFECT_STEP_TYPES } from '@/utils/eppSimulator'

// Dev only: one entry of the simulated event into a chain, and every chain it calls from there.
defineOptions({ name: 'EppTraceEntry' })

const props = defineProps({
  /** `Trace` from `simulateEvent` or `traceFromProcessingMetadata`. */
  trace: { type: Object, required: true },
  entryIndex: { type: Number, required: true },
  /** `(chainId, ruleGuid) => rule | null`, the rule as it is on screen. */
  ruleFor: { type: Function, required: true },
  chainLabelFor: { type: Function, required: true },
  actionNameFor: { type: Function, required: true },
  /** `(visit) => string` */
  reasonFor: { type: Function, required: true },
  /** `(note) => string` */
  noteFor: { type: Function, required: true },
  /** `(ruleGuid) => 'match'|'no-match'`, the result assumed for a filter script. */
  scriptOutcomeFor: { type: Function, default: () => 'match' },
})

const emit = defineEmits(['open-rule', 'toggle-script'])

const entry = computed(() => props.trace.chainsEntered[props.entryIndex])

/** Matched visits stand alone; runs of skipped or not-reached ones fold into one line. */
const items = computed(() => {
  const out = []
  props.trace.visits.forEach((visit, index) => {
    if (visit.entry !== props.entryIndex) return
    if (visit.outcome === 'matched') {
      out.push({ key: `v${index}`, kind: 'matched', visit })
      return
    }
    const last = out.at(-1)
    if (last?.kind === visit.outcome) last.visits.push(visit)
    else out.push({ key: `v${index}`, kind: visit.outcome, visits: [visit] })
  })
  return out
})

/** Index of the last entry made from inside this one. */
const lastDescendant = computed(() => {
  const entries = props.trace.chainsEntered
  let last = props.entryIndex
  while (last + 1 < entries.length && entries[last + 1].depth > entry.value.depth) last++
  return last
})

/** The event left this chain after its last rule, rather than being stopped inside it. */
const ranToEnd = computed(() => {
  const stop = props.trace.stoppedAt
  return !stop || stop.entry < props.entryIndex || stop.entry > lastDescendant.value
})

const callerLabel = computed(() => {
  const from = entry.value
  if (from.fromChainId == null) return ''
  const caller = props.trace.visits[from.fromVisit]
  return `${props.chainLabelFor(from.fromChainId)}${caller ? ` rule ${caller.ruleNumber}` : ''}`
})

const openFolds = ref(new Set())

function toggleFold(key) {
  const next = new Set(openFolds.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openFolds.value = next
}

function ruleName(visit) {
  const rule = props.ruleFor(visit.chainId, visit.ruleGuid)
  return rule?.comments || visit.comments || '(unnamed rule)'
}

function foldLabel(item) {
  const count = item.visits.length
  if (item.kind === 'skipped') return count === 1 ? '1 rule skipped' : `${count} rules skipped`
  const first = item.visits[0].ruleNumber
  const last = item.visits.at(-1).ruleNumber
  return count === 1 ? `Rule ${first} not reached` : `Rules ${first}–${last} not reached`
}

/** Icons for what a matched rule does; chain calls and the stop are drawn as structure. */
function stepIcons(visit) {
  if (visit.effects) {
    return visit.effects
      .filter((effect) => !effect.type.startsWith('chain-call'))
      .map((effect, i) => ({
        id: `e${i}`,
        type: EFFECT_STEP_TYPES[effect.type] ?? 'server-action',
        tip: effectTip(effect),
      }))
  }
  const icons = []
  for (const step of visit.steps ?? []) {
    if (step.type === 'chain-call') continue
    const tip =
      step.type === 'server-action'
        ? `Run ${props.actionNameFor(step.actionId)}${step.active ? '' : ' (inactive)'}`
        : STEP_TITLES[step.type]
    icons.push({ id: step.id, type: step.type, tip })
    for (const extra of step.extras ?? []) {
      icons.push({ id: `${step.id}-${extra.type}`, type: extra.type, tip: STEP_TITLES[extra.type] })
    }
  }
  return icons
}

function effectTip(effect) {
  const parts = [effect.type]
  if (effect.info) parts.push(effect.info)
  if (effect.id) parts.push(`#${effect.id}`)
  if (effect.scheduled) parts.push('scheduled')
  if (effect.failed) parts.push('failed')
  return parts.join(' · ')
}

function callChainLabel(call) {
  return call.chainId != null ? props.chainLabelFor(call.chainId) : (call.name ?? 'unknown chain')
}

/** Under a fold the line must say which rule it is about. */
function scriptSkipText(item, visit) {
  const text = 'filter script assumed not to match'
  return item.visits.length > 1 ? `#${visit.ruleNumber}: ${text}` : `F${text.slice(1)}`
}

function isScriptAssumed(visit) {
  return visit.assumed?.includes('script')
}

function openRule(visit) {
  emit('open-rule', { chainId: visit.chainId, ruleGuid: visit.ruleGuid })
}
</script>

<template>
  <section class="trace-entry" :class="{ 'trace-entry--nested': entry.depth > 0 }">
    <header class="trace-entry__head">
      <CornerDownRight v-if="entry.depth > 0" :size="14" aria-hidden="true" />
      <button
        type="button"
        class="trace-link trace-entry__chain"
        @click="emit('open-rule', { chainId: entry.chainId, ruleGuid: null })"
      >
        {{ chainLabelFor(entry.chainId) }}
      </button>
      <span class="trace-muted">
        {{ entry.depth > 0 ? `called from ${callerLabel}` : 'the event enters here' }}
      </span>
    </header>

    <p v-if="!items.length && !trace.replay" class="trace-muted trace-line">
      No rules in this chain
    </p>
    <p v-else-if="!items.length" class="trace-muted trace-line">No rule matched here</p>

    <ol class="trace-items">
      <li
        v-for="item in items"
        :key="item.key"
        class="trace-item"
        :class="`trace-item--${item.kind}`"
      >
        <template v-if="item.kind === 'matched'">
          <div class="trace-rule">
            <CircleCheck :size="15" class="trace-rule__icon" aria-hidden="true" />
            <button type="button" class="trace-link trace-rule__name" @click="openRule(item.visit)">
              <span class="trace-rule__num">#{{ item.visit.ruleNumber }}</span>
              {{ ruleName(item.visit) }}
            </button>
            <span class="trace-rule__steps">
              <span
                v-for="icon in stepIcons(item.visit)"
                :key="icon.id"
                v-tooltip.top="icon.tip"
                role="img"
                :aria-label="icon.tip"
              >
                <EppActionIcon :type="icon.type" :size="14" />
              </span>
            </span>
          </div>

          <p v-if="isScriptAssumed(item.visit)" class="trace-line trace-assumption">
            <FileQuestion :size="13" aria-hidden="true" />
            Filter script assumed to match
            <button
              type="button"
              class="trace-link"
              @click="emit('toggle-script', item.visit.ruleGuid)"
            >
              Assume it does not
            </button>
          </p>
          <p v-for="(note, i) in item.visit.notes ?? []" :key="i" class="trace-line trace-note">
            <Clock :size="13" aria-hidden="true" />
            {{ noteFor(note) }}
          </p>

          <template v-for="(call, i) in item.visit.calls ?? []" :key="i">
            <EppTraceEntry
              v-if="call.result === 'entered'"
              :trace="trace"
              :entry-index="call.entry"
              :rule-for="ruleFor"
              :chain-label-for="chainLabelFor"
              :action-name-for="actionNameFor"
              :reason-for="reasonFor"
              :note-for="noteFor"
              :script-outcome-for="scriptOutcomeFor"
              @open-rule="emit('open-rule', $event)"
              @toggle-script="emit('toggle-script', $event)"
            />
            <p v-else class="trace-line trace-call" :class="`trace-call--${call.result}`">
              <Repeat v-if="call.result === 'loop'" :size="13" aria-hidden="true" />
              <Unlink v-else-if="call.result === 'unavailable'" :size="13" aria-hidden="true" />
              <CircleDashed v-else :size="13" aria-hidden="true" />
              <template v-if="call.result === 'loop'">
                Call to {{ callChainLabel(call) }} skipped: the chain is already running for this
                event
              </template>
              <template v-else-if="call.result === 'unavailable'">
                Call to {{ callChainLabel(call) }} not followed: the chain is not readable or no
                longer exists
              </template>
              <template v-else>
                Call to {{ callChainLabel(call) }} not made: processing stopped
              </template>
            </p>
          </template>

          <p v-if="item.visit.stops" class="trace-line trace-stop">
            <OctagonX :size="14" aria-hidden="true" />
            Stop processing
          </p>
        </template>

        <template v-else>
          <!-- A lone skip needs no fold. -->
          <div v-if="item.kind === 'skipped' && item.visits.length === 1" class="trace-rule">
            <CircleSlash :size="15" class="trace-rule__icon" aria-hidden="true" />
            <button
              type="button"
              class="trace-link trace-rule__name"
              @click="openRule(item.visits[0])"
            >
              <span class="trace-rule__num">#{{ item.visits[0].ruleNumber }}</span>
              {{ ruleName(item.visits[0]) }}
            </button>
            <!-- A script skip says so on its assumption line below. -->
            <span v-if="item.visits[0].reason !== 'script'" class="trace-reason">
              {{ reasonFor(item.visits[0]) }}
            </span>
          </div>
          <template v-else>
            <button
              type="button"
              class="trace-fold"
              :aria-expanded="openFolds.has(item.key)"
              @click="toggleFold(item.key)"
            >
              <component :is="openFolds.has(item.key) ? ChevronDown : ChevronRight" :size="14" />
              <CircleSlash v-if="item.kind === 'skipped'" :size="14" aria-hidden="true" />
              <CircleDashed v-else :size="14" aria-hidden="true" />
              {{ foldLabel(item) }}
            </button>
            <ul v-if="openFolds.has(item.key)" class="trace-fold__list">
              <li v-for="visit in item.visits" :key="visit.ruleGuid" class="trace-rule">
                <button type="button" class="trace-link trace-rule__name" @click="openRule(visit)">
                  <span class="trace-rule__num">#{{ visit.ruleNumber }}</span>
                  {{ ruleName(visit) }}
                </button>
                <span v-if="visit.outcome === 'skipped'" class="trace-reason">
                  {{ reasonFor(visit) }}
                </span>
              </li>
            </ul>
          </template>
          <template v-for="visit in item.visits" :key="`a-${visit.ruleGuid}`">
            <p v-if="visit.reason === 'script'" class="trace-line trace-assumption">
              <FileQuestion :size="13" aria-hidden="true" />
              {{ scriptSkipText(item, visit) }}
              <button
                type="button"
                class="trace-link"
                @click="emit('toggle-script', visit.ruleGuid)"
              >
                Assume it does
              </button>
            </p>
          </template>
        </template>
      </li>
    </ol>

    <p v-if="ranToEnd && !trace.replay" class="trace-line trace-muted trace-end">
      <template v-if="entry.depth > 0">
        End of {{ chainLabelFor(entry.chainId) }}: back to {{ callerLabel }}
      </template>
      <template v-else>End of {{ chainLabelFor(entry.chainId) }}: processing ends</template>
    </p>
  </section>
</template>

<style scoped>
.trace-entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.trace-entry--nested {
  margin: 0.25rem 0 0.25rem 0.5rem;
  padding-left: 0.75rem;
  border-left: 2px solid var(--p-primary-color);
}

.trace-entry__head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  font-size: 0.8125rem;
  color: var(--p-primary-color);
}

.trace-entry__chain {
  font-weight: 600;
}

.trace-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.trace-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.trace-rule {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  font-size: 0.8125rem;
}

.trace-rule__icon {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.trace-item--matched .trace-rule__icon {
  color: var(--p-primary-color);
}

.trace-rule__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.trace-item--matched .trace-rule__name {
  font-weight: 600;
}

.trace-rule__num {
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}

.trace-rule__steps {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: auto;
  flex-shrink: 0;
}

.trace-reason {
  margin-left: auto;
  flex-shrink: 1;
  min-width: 0;
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.75rem;
  text-align: right;
}

.trace-line {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin: 0;
  padding-left: 1.3rem;
  font-size: 0.75rem;
}

.trace-muted {
  color: var(--p-text-muted-color);
}

.trace-assumption {
  color: var(--p-orange-700, #c2410c);
}

html.app-dark .trace-assumption {
  color: var(--p-orange-300, #fdba74);
}

.trace-note {
  color: var(--p-text-muted-color);
}

.trace-call {
  color: var(--p-text-muted-color);
}

.trace-call--loop,
.trace-call--unavailable {
  color: var(--p-orange-700, #c2410c);
}

html.app-dark .trace-call--loop,
html.app-dark .trace-call--unavailable {
  color: var(--p-orange-300, #fdba74);
}

.trace-stop {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--p-red-600, #dc2626);
}

html.app-dark .trace-stop {
  color: var(--p-red-400, #f87171);
}

.trace-end {
  padding-left: 0;
  font-style: italic;
}

.trace-fold {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  align-self: flex-start;
  padding: 0.125rem 0.25rem;
  margin-left: -0.25rem;
  border: none;
  border-radius: 4px;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.trace-fold:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.trace-fold:focus-visible,
.trace-link:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.trace-fold__list {
  list-style: none;
  margin: 0 0 0.25rem;
  padding: 0 0 0 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.trace-item--not-reached .trace-fold,
.trace-item--not-reached .trace-fold__list {
  opacity: 0.75;
}

.trace-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.trace-link:hover {
  color: var(--p-primary-color);
  text-decoration: underline;
}

.trace-line .trace-link {
  color: var(--p-primary-color);
}
</style>
