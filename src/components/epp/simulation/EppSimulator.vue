<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { FlaskConical } from 'lucide-vue-next'
import FormField from '@/components/common/FormField.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import RecordPanel from '@/components/common/RecordPanel.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import EventSelectField from '@/components/epp/EventSelectField.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import EppTraceEntry from './EppTraceEntry.vue'
import EppReplayForm from './EppReplayForm.vue'
import { useObjectAncestors, useObjectsByIds } from '@/queries/useObjectQueries'
import { prefs } from '@/utils/appStorage'
import {
  noteText,
  simulateEvent,
  skipReasonText,
  traceMarks,
  tracePath,
} from '@/utils/eppSimulator'
import { getStatusInfo } from '@/utils/objectUtils'

// Dev only: runs an event through the rules on screen, unsaved drafts included, in the browser.
// The section loads it only in dev builds.
defineOptions({ name: 'EppSimulator' })

const props = defineProps({
  open: { type: Boolean, default: false },
  /**
   * Where the toggle button goes; null hides it. The simulator itself stays mounted while the
   * rule editor replaces the list, so a trace survives editing the rule it is about.
   */
  toggleTo: { type: Object, default: null },
  /** Every chain the user can read, main first. */
  chains: { type: Array, default: () => [] },
  /** The same chains with their rules as the server has them. */
  chainsWithRules: { type: Array, default: () => [] },
  /** `(chainId, serverRules) => rules`: what the section shows, drafts included. */
  rulesFor: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  /** Event code → event template. */
  eventTemplates: { type: Object, default: () => ({}) },
  actionNameFor: { type: Function, required: true },
  chainLabelFor: { type: Function, required: true },
})

const emit = defineEmits(['update:open', 'update:result', 'open-rule'])

const WIDTH_FIELD = 'eppSimulator.width'
const width = ref(prefs.get(WIDTH_FIELD, 480))
watch(width, (px) => prefs.set(WIDTH_FIELD, px))

const MODE_OPTIONS = [
  { value: 'simulate', label: 'Simulate' },
  { value: 'replay', label: 'Replay a real event' },
]
const mode = ref('simulate')

const SEVERITY_OPTIONS = [0, 1, 2, 3, 4].map((value) => ({
  value,
  label: getStatusInfo(value).label,
}))

const TIME_OPTIONS = [
  { value: 'now', label: 'Now' },
  { value: 'custom', label: 'Custom' },
]

const SCRIPT_OPTIONS = [
  { value: 'match', label: 'Match' },
  { value: 'no-match', label: "Don't match" },
]

const form = ref({
  eventCode: null,
  severity: 0,
  sourceId: null,
  sourceName: '',
  correlated: false,
  timeMode: 'now',
  customTime: null,
  scripts: 'match',
})

// The template's severity is what a generated event carries unless its origin overrides it.
watch(
  () => form.value.eventCode,
  (code) => {
    const severity = props.eventTemplates[code]?.severity
    if (Number.isInteger(severity) && severity <= 4) form.value.severity = severity
  },
)

const sourcePickerVisible = ref(false)

function onSourcePicked(node) {
  form.value.sourceId = node?.id ?? null
  form.value.sourceName = node?.name ?? ''
  sourcePickerVisible.value = false
}

function clearSource() {
  form.value.sourceId = null
  form.value.sourceName = ''
}

/** Set by Run, which also reads the clock: the trace then follows edits to rules and inputs. */
const runAt = ref(null)
const runId = ref(0)
const scriptOverrides = ref(new Map())

const canRun = computed(
  () => !!form.value.eventCode && (form.value.timeMode === 'now' || form.value.customTime != null),
)

function run() {
  if (!canRun.value) return
  runAt.value = new Date()
  runId.value++
  scriptOverrides.value = new Map()
}

function clear() {
  runAt.value = null
  replayTrace.value = null
}

const now = computed(() =>
  form.value.timeMode === 'custom' && form.value.customTime ? form.value.customTime : runAt.value,
)

function scriptOutcomeFor(ruleGuid) {
  return scriptOverrides.value.get(ruleGuid) ?? form.value.scripts
}

function toggleScript(ruleGuid) {
  const next = new Map(scriptOverrides.value)
  next.set(ruleGuid, scriptOutcomeFor(ruleGuid) === 'match' ? 'no-match' : 'match')
  scriptOverrides.value = next
}

const running = computed(() => mode.value === 'simulate' && runAt.value != null)

const {
  data: ancestry,
  isLoading: ancestryLoading,
  error: ancestryError,
} = useObjectAncestors(computed(() => (running.value ? form.value.sourceId : null)))

const chainRules = computed(
  () =>
    new Map(
      props.chainsWithRules.map((chain) => [chain.id, props.rulesFor(chain.id, chain.rules)]),
    ),
)

const simulatedTrace = computed(() => {
  if (!running.value || props.loading) return null
  const sourceId = form.value.sourceId
  if (sourceId && ancestryLoading.value) return null
  const ancestors = sourceId && ancestry.value ? new Set(ancestry.value.ids) : null
  return simulateEvent({
    chains: chainRules.value,
    event: {
      code: form.value.eventCode,
      severity: form.value.severity,
      sourceId,
      correlated: form.value.correlated,
    },
    now: now.value,
    ancestorsOf: (id) => (id === sourceId ? ancestors : null),
    scriptOutcome: (rule) => scriptOutcomeFor(rule.guid),
  })
})

/** Set by the replay form; it stands in for a simulation while replay mode is on. */
const replayTrace = ref(null)

const trace = computed(() => (mode.value === 'replay' ? replayTrace.value : simulatedTrace.value))

// Names for the reasons: the source, and the objects a skip points at.
const detailObjectIds = computed(() => {
  const ids = new Set()
  for (const visit of trace.value?.visits ?? []) {
    const { excludedBy, matchedBy } = visit.detail ?? {}
    if (excludedBy != null) ids.add(excludedBy)
    if (matchedBy != null) ids.add(matchedBy)
  }
  return [...ids]
})
const { objectsById } = useObjectsByIds(detailObjectIds)

function objectName(id) {
  if (id === form.value.sourceId && form.value.sourceName) return form.value.sourceName
  return objectsById.value.get(id)?.name ?? `Object #${id}`
}

function reasonFor(visit) {
  return skipReasonText(visit, { sourceId: form.value.sourceId, objectName })
}

const rulesByChain = computed(() => {
  const byChain = new Map()
  for (const [chainId, rules] of chainRules.value) {
    byChain.set(chainId, new Map(rules.map((rule) => [rule.guid, rule])))
  }
  return byChain
})

function ruleFor(chainId, ruleGuid) {
  return rulesByChain.value.get(chainId)?.get(ruleGuid) ?? null
}

const summary = computed(() => {
  const t = trace.value
  if (!t) return null
  const matched = t.visits.filter((visit) => visit.outcome === 'matched')
  const chainsHit = new Set(matched.map((visit) => visit.chainId))
  const assumptions = t.visits.filter((visit) => visit.assumed?.length).length
  const stop = t.stoppedAt
  const stopVisit =
    stop && t.visits.find((v) => v.entry === stop.entry && v.ruleGuid === stop.ruleGuid)
  return {
    matched: matched.length,
    chains: chainsHit.size,
    assumptions,
    stoppedBy: stopVisit
      ? `${props.chainLabelFor(stop.chainId)} rule ${stopVisit.ruleNumber}`
      : null,
  }
})

/** Nested entries are drawn inside the rule that called them. */
const topEntries = computed(() =>
  (trace.value?.chainsEntered ?? []).flatMap((entry, index) => (entry.depth === 0 ? [index] : [])),
)

const unavailableStart = computed(() =>
  trace.value?.unavailableChains.some((u) => u.fromChainId == null),
)

const result = computed(() => {
  const t = trace.value
  if (!t) return null
  const { rules, chains } = traceMarks(t)
  const marks = new Map()
  for (const [guid, mark] of rules) {
    marks.set(guid, {
      outcome: mark.outcome,
      count: mark.count,
      stops: !!mark.visit.stops,
      reason:
        mark.outcome === 'skipped'
          ? reasonFor(mark.visit)
          : mark.outcome === 'not-reached'
            ? 'processing stopped before this rule'
            : null,
    })
  }
  return {
    runId: `${mode.value}-${runId.value}`,
    rules: marks,
    chains,
    path: tracePath(t),
    replay: !!t.replay,
    expandFor: (chainId) =>
      new Set(
        t.visits
          .filter((visit) => visit.chainId === chainId && visit.outcome === 'matched')
          .map((visit) => visit.ruleGuid),
      ),
  }
})

watch(result, (value) => emit('update:result', value), { immediate: true })
onBeforeUnmount(() => emit('update:result', null))

function onReplay(replayed) {
  replayTrace.value = replayed
  runId.value++
}

const timeLabel = computed(() => {
  if (!now.value) return ''
  const text = now.value.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return form.value.timeMode === 'custom' ? text : `${text} (browser clock)`
})
</script>

<template>
  <Teleport v-if="toggleTo" :to="toggleTo">
    <!-- Outlined while closed with a trace still marking the rules. -->
    <Button
      v-tooltip.bottom="'Simulate an event (dev build only)'"
      size="small"
      :severity="open ? 'primary' : 'secondary'"
      :text="!open && !result"
      :outlined="!open && !!result"
      rounded
      aria-label="Simulate event"
      :aria-pressed="open"
      @click="emit('update:open', !open)"
    >
      <template #icon><FlaskConical :size="16" aria-hidden="true" /></template>
    </Button>
  </Teleport>

  <Teleport to="body">
    <RecordPanel
      :visible="open"
      :width="width"
      title="Simulate event"
      resize-label="Resize simulation panel"
      @update:visible="emit('update:open', $event)"
      @update:width="width = $event"
    >
      <div class="sim">
        <SelectButton
          v-model="mode"
          :options="MODE_OPTIONS"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          aria-label="Simulation mode"
        />

        <template v-if="mode === 'simulate'">
          <p class="sim-hint">
            Runs in the browser against the rules on screen, unsaved changes included. Nothing is
            sent to the server and nothing is executed.
          </p>

          <div class="sim-form">
            <FormField label="Event" group full-width>
              <EventSelectField v-model="form.eventCode" empty-label="(select an event)" />
            </FormField>

            <FormField label="Source object" group full-width>
              <div class="sim-picker">
                <span class="sim-picker__value" :class="{ 'sim-muted': !form.sourceId }">
                  {{ form.sourceId ? form.sourceName || `Object #${form.sourceId}` : '(none)' }}
                </span>
                <Button
                  label="Select..."
                  icon="pi pi-list"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="sourcePickerVisible = true"
                />
                <Button
                  v-if="form.sourceId"
                  icon="pi pi-times"
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  aria-label="Clear source object"
                  @click="clearSource"
                />
              </div>
            </FormField>

            <FormField v-slot="{ id }" label="Severity">
              <Select
                v-model="form.severity"
                :input-id="id"
                :options="SEVERITY_OPTIONS"
                option-label="label"
                option-value="value"
                size="small"
              >
                <template #value="{ value }">
                  <span class="sim-severity">
                    <StatusIcon :status="value" size="0.85rem" />
                    {{ getStatusInfo(value).label }}
                  </span>
                </template>
                <template #option="{ option }">
                  <span class="sim-severity">
                    <StatusIcon :status="option.value" size="0.85rem" />
                    {{ option.label }}
                  </span>
                </template>
              </Select>
            </FormField>

            <FormField label="Processing time" group>
              <div class="sim-time">
                <SelectButton
                  v-model="form.timeMode"
                  :options="TIME_OPTIONS"
                  option-label="label"
                  option-value="value"
                  :allow-empty="false"
                  size="small"
                  aria-label="Processing time"
                />
                <DatePicker
                  v-if="form.timeMode === 'custom'"
                  v-model="form.customTime"
                  show-time
                  hour-format="24"
                  size="small"
                  placeholder="Date and time"
                  aria-label="Custom processing time"
                />
              </div>
            </FormField>

            <FormField label="Assume filter scripts" group>
              <SelectButton
                v-model="form.scripts"
                :options="SCRIPT_OPTIONS"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                size="small"
                aria-label="Filter script assumption"
              />
            </FormField>

            <FormField v-slot="{ id }" full-width>
              <div class="sim-check">
                <Checkbox v-model="form.correlated" :input-id="id" binary />
                <label :for="id">Correlated (the event has a root event)</label>
              </div>
            </FormField>
          </div>

          <div class="sim-actions">
            <Button
              :label="runAt ? 'Run again' : 'Run'"
              icon="pi pi-play"
              size="small"
              :disabled="!canRun"
              @click="run"
            />
            <Button
              v-if="runAt"
              label="Clear"
              icon="pi pi-times"
              size="small"
              severity="secondary"
              text
              @click="clear"
            />
          </div>
        </template>

        <EppReplayForm v-else :chains="chains" @replay="onReplay" @clear="replayTrace = null" />

        <LoadingState
          v-if="running && (loading || (form.sourceId && ancestryLoading))"
          class="sim-loading"
        />

        <Message v-if="running && ancestryError" severity="warn" :closable="false" size="small">
          The source object's containers could not be read; rules that name sources treat it as
          unknown.
        </Message>
        <Message
          v-else-if="running && ancestry && !ancestry.complete"
          severity="warn"
          :closable="false"
          size="small"
        >
          Some containers of the source object are not readable, so a rule naming one of their
          parents may be judged wrongly.
        </Message>
        <Message v-if="running && ancestry === null" severity="warn" :closable="false" size="small">
          The source object does not exist; only rules with a negated source list match it.
        </Message>

        <section v-if="trace" class="sim-trace" aria-label="Trace">
          <header class="sim-summary">
            <span class="sim-summary__lead">
              {{ $plural(summary.matched, 'rule') }} matched
              <template v-if="summary.chains > 1">in {{ summary.chains }} chains</template>
            </span>
            <span v-if="summary.stoppedBy" class="sim-summary__chip sim-summary__chip--stop">
              Stopped by {{ summary.stoppedBy }}
            </span>
            <span v-if="summary.assumptions" class="sim-summary__chip sim-summary__chip--assumed">
              {{ $plural(summary.assumptions, 'assumption') }}
            </span>
            <span v-if="mode === 'simulate'" class="sim-muted sim-summary__time">
              {{ timeLabel }}
            </span>
          </header>

          <p v-if="trace.replay" class="sim-hint">
            The server records only the rules that matched, with what each one did. Skipped rules
            are not shown.
          </p>

          <Message v-if="unavailableStart" severity="warn" :closable="false" size="small">
            The main chain is not readable, and every event starts there.
          </Message>

          <EppTraceEntry
            v-for="index in topEntries"
            :key="index"
            :trace="trace"
            :entry-index="index"
            :rule-for="ruleFor"
            :chain-label-for="chainLabelFor"
            :action-name-for="actionNameFor"
            :reason-for="reasonFor"
            :note-for="noteText"
            :script-outcome-for="scriptOutcomeFor"
            @open-rule="emit('open-rule', $event)"
            @toggle-script="toggleScript"
          />
        </section>
      </div>
    </RecordPanel>
  </Teleport>

  <ObjectPickerDialog
    v-model:visible="sourcePickerVisible"
    title="Select Source Object"
    @select="onSourcePicked"
  />
</template>

<style scoped>
.sim {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sim-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.sim-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem 1rem;
}

.sim-severity {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.sim-picker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.sim-picker__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
}

.sim-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.sim-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.sim-actions {
  display: flex;
  gap: 0.5rem;
}

.sim-muted {
  color: var(--p-text-muted-color);
}

.sim-loading {
  padding: 1rem 0;
}

.sim-trace {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
}

.sim-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem 0.5rem;
  font-size: 0.8125rem;
}

.sim-summary__lead {
  font-weight: 600;
}

.sim-summary__chip {
  padding: 0 0.45rem;
  line-height: 1.25rem;
  border-radius: 0.625rem;
  font-size: 0.75rem;
}

.sim-summary__chip--stop {
  background: color-mix(in srgb, var(--p-red-500, #ef4444) 14%, transparent);
  color: var(--p-red-700, #b91c1c);
}

html.app-dark .sim-summary__chip--stop {
  color: var(--p-red-300, #fca5a5);
}

.sim-summary__chip--assumed {
  background: color-mix(in srgb, var(--p-orange-500, #f97316) 14%, transparent);
  color: var(--p-orange-700, #c2410c);
}

html.app-dark .sim-summary__chip--assumed {
  color: var(--p-orange-300, #fdba74);
}

.sim-summary__time {
  margin-left: auto;
  font-size: 0.75rem;
}
</style>
